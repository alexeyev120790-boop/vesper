import os
import io
import sys
import base64
import struct
import hashlib
import zipfile
import subprocess
import urllib.request

def lp_bytes(b: bytes) -> bytes:
    return struct.pack('<I', len(b)) + b

def lp_seq(items: list) -> bytes:
    buf = b''.join(items)
    return struct.pack('<I', len(buf)) + buf

def compute_v2_digest(sec1: bytes, sec3: bytes, sec4: bytes) -> bytes:
    CHUNK_SIZE = 1048576
    all_chunks = []
    for sec in [sec1, sec3, sec4]:
        offset = 0
        while offset < len(sec):
            chunk = sec[offset:offset + CHUNK_SIZE]
            offset += len(chunk)
            chunk_header = b'\x5a' + struct.pack('<I', len(chunk))
            all_chunks.append(hashlib.sha256(chunk_header + chunk).digest())
    top_header = b'\xa5' + struct.pack('<I', len(all_chunks))
    return hashlib.sha256(top_header + b''.join(all_chunks)).digest()

def build_apk():
    output_dir = os.path.join(os.getcwd(), 'public', 'downloads')
    os.makedirs(output_dir, exist_ok=True)
    output_apk = os.path.join(output_dir, 'VesperChat_v2.4.apk')

    print("Building dual-signed (Scheme v1 + Scheme v2) Android APK VesperChat_v2.4.apk...")

    # Base APK template with binary AndroidManifest.xml and classes.dex
    template_url = 'https://github.com/faustinpataule12-art/pwa-apk/releases/download/build-1/app-debug.apk'
    try:
        req = urllib.request.Request(template_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req) as resp:
            base_bytes = resp.read()
    except Exception as e:
        print("Failed to download base APK template:", e)
        sys.exit(1)

    input_zip = zipfile.ZipFile(io.BytesIO(base_bytes))
    entries = {}
    for item in input_zip.infolist():
        if not item.filename.startswith('META-INF/'):
            entries[item.filename] = input_zip.read(item.filename)

    # Put current VesperChat index.html into assets/www/index.html
    html_path = os.path.join(os.getcwd(), 'index.html')
    if os.path.exists(html_path):
        with open(html_path, 'rb') as f:
            entries['assets/www/index.html'] = f.read()

    # Generate MANIFEST.MF
    manifest_lines = ['Manifest-Version: 1.0', 'Created-By: 1.0 (Android APKSigner)', '']
    for filename in sorted(entries.keys()):
        content = entries[filename]
        sha256 = base64.b64encode(hashlib.sha256(content).digest()).decode('ascii')
        sha1 = base64.b64encode(hashlib.sha1(content).digest()).decode('ascii')
        manifest_lines.append(f'Name: {filename}')
        manifest_lines.append(f'SHA-256-Digest: {sha256}')
        manifest_lines.append(f'SHA1-Digest: {sha1}')
        manifest_lines.append('')

    manifest_data = '\r\n'.join(manifest_lines).encode('utf-8')

    # Generate CERT.SF
    sf_lines = [
        'Signature-Version: 1.0',
        'Created-By: 1.0 (Android APKSigner)',
        f'SHA-256-Digest-Manifest: {base64.b64encode(hashlib.sha256(manifest_data).digest()).decode("ascii")}',
        f'SHA1-Digest-Manifest: {base64.b64encode(hashlib.sha1(manifest_data).digest()).decode("ascii")}',
        ''
    ]

    manifest_sections = manifest_data.decode('utf-8').split('\r\n\r\n')
    for sec in manifest_sections:
        if sec.startswith('Name: '):
            name_line = sec.split('\r\n')[0]
            sec_bytes = (sec + '\r\n\r\n').encode('utf-8')
            sha256 = base64.b64encode(hashlib.sha256(sec_bytes).digest()).decode('ascii')
            sha1 = base64.b64encode(hashlib.sha1(sec_bytes).digest()).decode('ascii')
            sf_lines.append(name_line)
            sf_lines.append(f'SHA-256-Digest: {sha256}')
            sf_lines.append(f'SHA1-Digest: {sha1}')
            sf_lines.append('')

    cert_sf_data = '\r\n'.join(sf_lines).encode('utf-8')

    # Key & Cert generation for v1 & v2
    cert_key_path = '/tmp/vesper_cert.key'
    cert_crt_path = '/tmp/vesper_cert.crt'
    cert_sf_path = '/tmp/vesper_cert.sf'

    subprocess.run(['openssl', 'req', '-x509', '-nodes', '-days', '3650', '-newkey', 'rsa:2048',
                    '-keyout', cert_key_path, '-out', cert_crt_path,
                    '-subj', '/CN=VesperChat/O=VesperChat/C=US'], check=True, capture_output=True)

    with open(cert_sf_path, 'wb') as f:
        f.write(cert_sf_data)

    p7_proc = subprocess.run(['openssl', 'smime', '-sign', '-in', cert_sf_path, '-inkey', cert_key_path,
                             '-signer', cert_crt_path, '-outform', 'DER', '-binary', '-noattr'],
                            capture_output=True, check=True)

    cert_rsa_data = p7_proc.stdout

    # Export DER certificate and Public Key
    subprocess.run(['openssl', 'x509', '-in', cert_crt_path, '-outform', 'DER', '-out', '/tmp/vesper_cert.der'], check=True)
    subprocess.run(['openssl', 'x509', '-in', cert_crt_path, '-pubkey', '-noout'], stdout=open('/tmp/vesper_pub.pem', 'w'), check=True)
    subprocess.run(['openssl', 'rsa', '-pubin', '-in', '/tmp/vesper_pub.pem', '-outform', 'DER', '-out', '/tmp/vesper_pub.der'], check=True)

    with open('/tmp/vesper_cert.der', 'rb') as f:
        cert_der = f.read()

    with open('/tmp/vesper_pub.der', 'rb') as f:
        pubkey_der = f.read()

    # Build intermediate zip in memory (Scheme v1)
    v1_buf = io.BytesIO()
    with zipfile.ZipFile(v1_buf, 'w', zipfile.ZIP_DEFLATED) as out_zip:
        out_zip.writestr('META-INF/MANIFEST.MF', manifest_data)
        out_zip.writestr('META-INF/CERT.SF', cert_sf_data)
        out_zip.writestr('META-INF/CERT.RSA', cert_rsa_data)
        for filename, data in entries.items():
            out_zip.writestr(filename, data)

    raw_v1_zip = v1_buf.getvalue()

    # Parse zip sections for APK Signature Scheme v2 insertion
    eocd_idx = raw_v1_zip.rfind(b'PK\x05\x06')
    eocd = raw_v1_zip[eocd_idx:]

    cd_size = struct.unpack('<I', eocd[12:16])[0]
    cd_offset = struct.unpack('<I', eocd[16:20])[0]

    sec1 = raw_v1_zip[:cd_offset]
    sec3 = raw_v1_zip[cd_offset:cd_offset + cd_size]
    sec4 = raw_v1_zip[cd_offset + cd_size:]

    # Construct V2 signing block
    certs_seq = lp_seq([lp_bytes(cert_der)])
    attrs_seq = struct.pack('<I', 0)

    # Dummy calculation to get exact signing block length
    dummy_digest = b'\x00' * 32
    dummy_digest_item = lp_bytes(struct.pack('<I', 0x0201) + lp_bytes(dummy_digest))
    dummy_digests_seq = lp_seq([dummy_digest_item])
    dummy_signed_data = lp_seq([dummy_digests_seq, certs_seq, attrs_seq])

    p_dummy = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', cert_key_path], input=dummy_signed_data, capture_output=True, check=True)
    dummy_rsa_sig = p_dummy.stdout

    dummy_sig_item = lp_bytes(struct.pack('<I', 0x0201) + lp_bytes(dummy_rsa_sig))
    dummy_sigs_seq = lp_seq([dummy_sig_item])
    dummy_signer = lp_seq([lp_bytes(dummy_signed_data), dummy_sigs_seq, lp_bytes(pubkey_der)])
    dummy_v2_payload = lp_seq([dummy_signer])

    dummy_v2_pair = struct.pack('<Q', len(dummy_v2_payload) + 4) + struct.pack('<I', 0x7109871a) + dummy_v2_payload
    block_size = len(dummy_v2_pair) + 8 + 16

    # Update section 4 with new central directory offset
    new_cd_offset = cd_offset + block_size + 8
    updated_sec4 = sec4[:16] + struct.pack('<I', new_cd_offset) + sec4[20:]

    # Calculate real V2 top digest
    real_top_digest = compute_v2_digest(sec1, sec3, updated_sec4)

    # Generate real signed_data & signature
    real_digest_item = lp_bytes(struct.pack('<I', 0x0201) + lp_bytes(real_top_digest))
    real_digests_seq = lp_seq([real_digest_item])
    real_signed_data = lp_seq([real_digests_seq, certs_seq, attrs_seq])

    p_real = subprocess.run(['openssl', 'dgst', '-sha256', '-sign', cert_key_path], input=real_signed_data, capture_output=True, check=True)
    real_rsa_sig = p_real.stdout

    real_sig_item = lp_bytes(struct.pack('<I', 0x0201) + lp_bytes(real_rsa_sig))
    real_sigs_seq = lp_seq([real_sig_item])
    real_signer = lp_seq([lp_bytes(real_signed_data), real_sigs_seq, lp_bytes(pubkey_der)])
    real_v2_payload = lp_seq([real_signer])

    real_v2_pair = struct.pack('<Q', len(real_v2_payload) + 4) + struct.pack('<I', 0x7109871a) + real_v2_payload
    real_block_size = len(real_v2_pair) + 8 + 16

    signing_block = struct.pack('<Q', real_block_size) + real_v2_pair + struct.pack('<Q', real_block_size) + b'APK Sig Block 42'

    final_signed_apk = sec1 + signing_block + sec3 + updated_sec4

    with open(output_apk, 'wb') as f:
        f.write(final_signed_apk)

    print(f"Dual-signed APK successfully generated: {output_apk} ({os.path.getsize(output_apk)} bytes)")

if __name__ == '__main__':
    build_apk()

