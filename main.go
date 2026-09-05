package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 1024,
	WriteBufferSize: 1024 * 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type UserAccount struct {
	Username  string    `json:"username"`
	Password  string    `json:"password"`
	Color     string    `json:"color"`
	CreatedAt time.Time `json:"createdAt"`
}

type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	username string
	room     string
	color    string
}

type Message struct {
	Type        string     `json:"type"` // register, login, chat, typing, user_typing, switch_room, create_room, search_users, start_dm, etc.
	Username    string     `json:"username,omitempty"`
	Password    string     `json:"password,omitempty"`
	Content     string     `json:"content,omitempty"`
	Room        string     `json:"room,omitempty"`
	Recipient   string     `json:"recipient,omitempty"`
	Timestamp   string     `json:"timestamp,omitempty"`
	Color       string     `json:"color,omitempty"`
	FileName    string     `json:"fileName,omitempty"`
	FileType    string     `json:"fileType,omitempty"`
	FileData    string     `json:"fileData,omitempty"`
	FileSize    string     `json:"fileSize,omitempty"`
	Rooms       []string   `json:"rooms,omitempty"`
	OnlineUsers []string   `json:"onlineUsers,omitempty"`
	UsersList   []UserInfo `json:"usersList,omitempty"`
	History     []Message  `json:"history,omitempty"`
}

type UserInfo struct {
	Username string `json:"username"`
	Color    string `json:"color"`
	IsOnline bool   `json:"isOnline"`
}

type Room struct {
	Name      string
	Clients   map[*Client]bool
	History   []Message
	IsDM      bool
	createdAt time.Time
}

type Hub struct {
	clients    map[*Client]bool
	rooms      map[string]*Room
	users      map[string]*UserAccount
	register   chan *Client
	unregister chan *Client
	mu         sync.RWMutex
}

var avatarColors = []string{
	"#8b5cf6", "#a855f7", "#ec4899", "#3b82f6", "#10b981",
	"#f59e0b", "#ef4444", "#06b6d4", "#6366f1", "#d946ef",
}

const (
	usersFile = "users_data.json"
	roomsFile = "rooms_data.json"
)

func newHub() *Hub {
	h := &Hub{
		clients:    make(map[*Client]bool),
		rooms:      make(map[string]*Room),
		users:      make(map[string]*UserAccount),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}

	h.loadUsers()
	h.loadRooms()

	return h
}

func (h *Hub) loadUsers() {
	data, err := os.ReadFile(usersFile)
	if err == nil {
		var userList []*UserAccount
		if err := json.Unmarshal(data, &userList); err == nil {
			for _, u := range userList {
				h.users[strings.ToLower(u.Username)] = u
			}
		}
	}
}

func (h *Hub) saveUsersLocked() {
	list := make([]*UserAccount, 0, len(h.users))
	for _, u := range h.users {
		list = append(list, u)
	}
	bytes, err := json.MarshalIndent(list, "", "  ")
	if err == nil {
		_ = os.WriteFile(usersFile, bytes, 0644)
	}
}

type RoomDiskStorage struct {
	History []Message `json:"history"`
	IsDM    bool      `json:"isDM"`
}

func (h *Hub) loadRooms() {
	defaultRooms := []string{"Разговоры", "Поиск пати", "Программирование", "Музыка", "Игры"}
	for _, name := range defaultRooms {
		h.rooms[name] = &Room{
			Name:      name,
			Clients:   make(map[*Client]bool),
			History:   make([]Message, 0),
			IsDM:      false,
			createdAt: time.Now(),
		}
	}

	data, err := os.ReadFile(roomsFile)
	if err == nil {
		var diskRooms map[string]RoomDiskStorage
		if err := json.Unmarshal(data, &diskRooms); err == nil {
			for roomName, rData := range diskRooms {
				if _, exists := h.rooms[roomName]; !exists {
					h.rooms[roomName] = &Room{
						Name:      roomName,
						Clients:   make(map[*Client]bool),
						History:   rData.History,
						IsDM:      rData.IsDM,
						createdAt: time.Now(),
					}
				} else {
					h.rooms[roomName].History = rData.History
					h.rooms[roomName].IsDM = rData.IsDM
				}
			}
		}
	}
}

func (h *Hub) saveRoomsLocked() {
	diskRooms := make(map[string]RoomDiskStorage)
	for name, r := range h.rooms {
		hist := r.History
		if len(hist) > 100 {
			hist = hist[len(hist)-100:]
		}
		diskRooms[name] = RoomDiskStorage{
			History: hist,
			IsDM:    r.IsDM,
		}
	}
	bytes, err := json.MarshalIndent(diskRooms, "", "  ")
	if err == nil {
		_ = os.WriteFile(roomsFile, bytes, 0644)
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)

				if room, exists := h.rooms[client.room]; exists {
					delete(room.Clients, client)
					if client.username != "" && !room.IsDM {
						sysMsg := Message{
							Type:      "system",
							Content:   fmt.Sprintf("Пользователь %s покинул комнату", client.username),
							Room:      client.room,
							Timestamp: time.Now().Format("15:04"),
						}
						h.broadcastToRoomLocked(sysMsg, client.room)
						h.sendUserListLocked(client.room)
					}
				}
				h.broadcastGlobalUsersListLocked()
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) getPublicRoomsLocked() []string {
	names := make([]string, 0)
	for name, room := range h.rooms {
		if !room.IsDM {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	return names
}

func (h *Hub) getAllUsersInfoLocked() []UserInfo {
	onlineSet := make(map[string]bool)
	for client := range h.clients {
		if client.username != "" {
			onlineSet[strings.ToLower(client.username)] = true
		}
	}

	res := make([]UserInfo, 0, len(h.users))
	for _, u := range h.users {
		res = append(res, UserInfo{
			Username: u.Username,
			Color:    u.Color,
			IsOnline: onlineSet[strings.ToLower(u.Username)],
		})
	}
	return res
}

func (h *Hub) broadcastGlobalUsersListLocked() {
	usersList := h.getAllUsersInfoLocked()
	msg := Message{
		Type:      "search_users_result",
		UsersList: usersList,
	}
	bytes, err := json.Marshal(msg)
	if err == nil {
		for client := range h.clients {
			select {
			case client.send <- bytes:
			default:
			}
		}
	}
}

func (h *Hub) broadcastToRoomLocked(msg Message, roomName string) {
	room, ok := h.rooms[roomName]
	if !ok {
		if strings.HasPrefix(roomName, "DM:") {
			room = &Room{
				Name:      roomName,
				Clients:   make(map[*Client]bool),
				History:   make([]Message, 0),
				IsDM:      true,
				createdAt: time.Now(),
			}
			h.rooms[roomName] = room
		} else {
			return
		}
	}

	if msg.Type == "chat" || msg.Type == "system" {
		room.History = append(room.History, msg)
		if len(room.History) > 100 {
			room.History = room.History[1:]
		}
		h.saveRoomsLocked()
	}

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	if strings.HasPrefix(roomName, "DM:") {
		parts := strings.Split(roomName[3:], "_")
		targets := make(map[string]bool)
		for _, p := range parts {
			targets[strings.ToLower(p)] = true
		}

		for client := range h.clients {
			if client.username != "" && targets[strings.ToLower(client.username)] {
				select {
				case client.send <- msgBytes:
				default:
				}
			}
		}
	} else {
		for client := range h.clients {
			if client.room == roomName {
				select {
				case client.send <- msgBytes:
				default:
				}
			}
		}
	}
}

func (h *Hub) sendUserListLocked(roomName string) {
	if strings.HasPrefix(roomName, "DM:") {
		return
	}
	if _, ok := h.rooms[roomName]; ok {
		usersSet := make(map[string]bool)
		for client := range h.clients {
			if client.room == roomName && client.username != "" {
				usersSet[client.username] = true
			}
		}

		users := make([]string, 0, len(usersSet))
		for u := range usersSet {
			users = append(users, u)
		}

		userListMsg := Message{
			Type:        "user_list",
			Room:        roomName,
			OnlineUsers: users,
		}
		msgBytes, err := json.Marshal(userListMsg)
		if err == nil {
			for client := range h.clients {
				if client.room == roomName {
					select {
					case client.send <- msgBytes:
					default:
					}
				}
			}
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(20 * 1024 * 1024)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, bytes, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var msg Message
		if err := json.Unmarshal(bytes, &msg); err != nil {
			continue
		}

		c.handleMessage(msg)
	}
}

func getDMKey(u1, u2 string) string {
	s1 := strings.ToLower(u1)
	s2 := strings.ToLower(u2)
	if s1 < s2 {
		return fmt.Sprintf("DM:%s_%s", s1, s2)
	}
	return fmt.Sprintf("DM:%s_%s", s2, s1)
}

func (c *Client) handleMessage(msg Message) {
	c.hub.mu.Lock()
	defer c.hub.mu.Unlock()

	switch msg.Type {
	case "register":
		username := strings.TrimSpace(msg.Username)
		password := strings.TrimSpace(msg.Password)

		if username == "" || password == "" {
			c.sendErrorLocked("Заполните никнейм и пароль!")
			return
		}
		if len(username) < 3 || len(username) > 20 {
			c.sendErrorLocked("Длина никнейма должна быть от 3 до 20 символов!")
			return
		}

		lowerUser := strings.ToLower(username)
		if _, exists := c.hub.users[lowerUser]; exists {
			c.sendErrorLocked("Пользователь с таким никнеймом уже зарегистрирован!")
			return
		}

		color := avatarColors[len(username)%len(avatarColors)]
		account := &UserAccount{
			Username:  username,
			Password:  password,
			Color:     color,
			CreatedAt: time.Now(),
		}
		c.hub.users[lowerUser] = account
		c.hub.saveUsersLocked()

		c.username = username
		c.color = color
		c.joinRoomLocked(msg.Room)

	case "login":
		username := strings.TrimSpace(msg.Username)
		password := strings.TrimSpace(msg.Password)

		if username == "" || password == "" {
			c.sendErrorLocked("Введите никнейм и пароль!")
			return
		}

		lowerUser := strings.ToLower(username)
		account, exists := c.hub.users[lowerUser]
		if !exists {
			c.sendErrorLocked("Пользователь не найден. Зарегистрируйтесь!")
			return
		}

		if account.Password != password {
			c.sendErrorLocked("Неверный пароль!")
			return
		}

		c.username = account.Username
		c.color = account.Color
		c.joinRoomLocked(msg.Room)

	case "chat":
		content := strings.TrimSpace(msg.Content)
		hasFile := msg.FileData != ""

		if (!hasFile && content == "") || c.username == "" || c.room == "" {
			return
		}

		chatMsg := Message{
			Type:      "chat",
			Username:  c.username,
			Content:   content,
			Room:      c.room,
			Timestamp: time.Now().Format("15:04"),
			Color:     c.color,
			FileName:  msg.FileName,
			FileType:  msg.FileType,
			FileData:  msg.FileData,
			FileSize:  msg.FileSize,
		}

		c.hub.broadcastToRoomLocked(chatMsg, c.room)

	case "typing":
		if c.username == "" || c.room == "" {
			return
		}
		payload, err := json.Marshal(Message{
			Type:     "user_typing",
			Username: c.username,
			Room:     c.room,
		})
		if err == nil {
			if strings.HasPrefix(c.room, "DM:") {
				parts := strings.Split(c.room[3:], "_")
				targets := make(map[string]bool)
				for _, p := range parts {
					targets[strings.ToLower(p)] = true
				}
				for client := range c.hub.clients {
					if client != c && client.username != "" && targets[strings.ToLower(client.username)] {
						select {
						case client.send <- payload:
						default:
						}
					}
				}
			} else {
				for client := range c.hub.clients {
					if client != c && client.room == c.room {
						select {
						case client.send <- payload:
						default:
						}
					}
				}
			}
		}

	case "switch_room":
		newRoomName := msg.Room
		if newRoomName == "" || newRoomName == c.room {
			return
		}

		oldRoomName := c.room
		if oldRoom, ok := c.hub.rooms[oldRoomName]; ok {
			delete(oldRoom.Clients, c)
			if !oldRoom.IsDM {
				sysLeaveMsg := Message{
					Type:      "system",
					Content:   fmt.Sprintf("Пользователь %s перешел в другую комнату", c.username),
					Room:      oldRoomName,
					Timestamp: time.Now().Format("15:04"),
				}
				c.hub.broadcastToRoomLocked(sysLeaveMsg, oldRoomName)
			}
			c.hub.sendUserListLocked(oldRoomName)
		}

		c.room = newRoomName

		room, ok := c.hub.rooms[newRoomName]
		if !ok {
			if strings.HasPrefix(newRoomName, "DM:") {
				room = &Room{
					Name:      newRoomName,
					Clients:   make(map[*Client]bool),
					History:   make([]Message, 0),
					IsDM:      true,
					createdAt: time.Now(),
				}
				c.hub.rooms[newRoomName] = room
			} else {
				newRoomName = "Разговоры"
				c.room = newRoomName
				room = c.hub.rooms["Разговоры"]
			}
		}

		room.Clients[c] = true

		switchConfMsg := Message{
			Type:        "init",
			Username:    c.username,
			Room:        newRoomName,
			Color:       c.color,
			Rooms:       c.hub.getPublicRoomsLocked(),
			OnlineUsers: c.getRoomUsersLocked(newRoomName),
			UsersList:   c.hub.getAllUsersInfoLocked(),
			History:     room.History,
		}
		c.sendDirectLocked(switchConfMsg)

		if !room.IsDM {
			sysJoinMsg := Message{
				Type:      "system",
				Content:   fmt.Sprintf("Пользователь %s вошел в комнату", c.username),
				Room:      newRoomName,
				Timestamp: time.Now().Format("15:04"),
			}
			c.hub.broadcastToRoomLocked(sysJoinMsg, newRoomName)
		}
		c.hub.sendUserListLocked(newRoomName)

	case "start_dm":
		targetUser := strings.TrimSpace(msg.Recipient)
		if targetUser == "" || c.username == "" {
			return
		}

		acc, exists := c.hub.users[strings.ToLower(targetUser)]
		if !exists {
			c.sendErrorLocked(fmt.Sprintf("Пользователь %s не найден", targetUser))
			return
		}

		dmKey := getDMKey(c.username, acc.Username)
		dmRoom, ok := c.hub.rooms[dmKey]
		if !ok {
			dmRoom = &Room{
				Name:      dmKey,
				Clients:   make(map[*Client]bool),
				History:   make([]Message, 0),
				IsDM:      true,
				createdAt: time.Now(),
			}
			c.hub.rooms[dmKey] = dmRoom
			c.hub.saveRoomsLocked()
		}

		// Leave current room
		if oldRoom, ok := c.hub.rooms[c.room]; ok {
			delete(oldRoom.Clients, c)
			c.hub.sendUserListLocked(c.room)
		}

		c.room = dmKey
		dmRoom.Clients[c] = true

		c.sendDirectLocked(Message{
			Type:      "dm_started",
			Recipient: acc.Username,
			Color:     acc.Color,
			Room:      dmKey,
			History:   dmRoom.History,
		})

	case "create_room":
		roomName := strings.TrimSpace(msg.Room)
		if roomName == "" {
			c.sendErrorLocked("Название комнаты не может быть пустым")
			return
		}
		if _, exists := c.hub.rooms[roomName]; exists {
			c.sendErrorLocked("Комната с таким названием уже существует")
			return
		}

		c.hub.rooms[roomName] = &Room{
			Name:      roomName,
			Clients:   make(map[*Client]bool),
			History:   make([]Message, 0),
			IsDM:      false,
			createdAt: time.Now(),
		}
		c.hub.saveRoomsLocked()

		roomListMsg := Message{
			Type:  "room_list",
			Rooms: c.hub.getPublicRoomsLocked(),
		}
		msgBytes, err := json.Marshal(roomListMsg)
		if err == nil {
			for client := range c.hub.clients {
				select {
				case client.send <- msgBytes:
				default:
				}
			}
		}

	case "search_users":
		c.sendDirectLocked(Message{
			Type:      "search_users_result",
			UsersList: c.hub.getAllUsersInfoLocked(),
		})
	}
}

func (c *Client) joinRoomLocked(reqRoom string) {
	targetRoom := reqRoom
	if targetRoom == "" || c.hub.rooms[targetRoom] == nil {
		targetRoom = "Разговоры"
	}
	c.room = targetRoom

	room := c.hub.rooms[targetRoom]
	room.Clients[c] = true

	initMsg := Message{
		Type:        "auth_success",
		Username:    c.username,
		Room:        targetRoom,
		Color:       c.color,
		Rooms:       c.hub.getPublicRoomsLocked(),
		OnlineUsers: c.getRoomUsersLocked(targetRoom),
		UsersList:   c.hub.getAllUsersInfoLocked(),
		History:     room.History,
	}
	c.sendDirectLocked(initMsg)

	if !room.IsDM {
		sysMsg := Message{
			Type:      "system",
			Content:   fmt.Sprintf("Пользователь %s присоединился к комнате", c.username),
			Room:      targetRoom,
			Timestamp: time.Now().Format("15:04"),
		}
		c.hub.broadcastToRoomLocked(sysMsg, targetRoom)
	}
	c.hub.sendUserListLocked(targetRoom)
	c.hub.broadcastGlobalUsersListLocked()
}

func (c *Client) getRoomUsersLocked(roomName string) []string {
	usersSet := make(map[string]bool)
	for client := range c.hub.clients {
		if client.room == roomName && client.username != "" {
			usersSet[client.username] = true
		}
	}
	users := make([]string, 0, len(usersSet))
	for u := range usersSet {
		users = append(users, u)
	}
	return users
}

func (c *Client) sendDirectLocked(msg Message) {
	bytes, err := json.Marshal(msg)
	if err == nil {
		select {
		case c.send <- bytes:
		default:
		}
	}
}

func (c *Client) sendErrorLocked(errMsg string) {
	c.sendDirectLocked(Message{
		Type:    "error",
		Content: errMsg,
	})
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func serveWs(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade error:", err)
		return
	}

	client := &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}
	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	hub := newHub()
	go hub.run()

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		if _, err := os.Stat("index.html"); os.IsNotExist(err) {
			http.Error(w, "Ошибка: Файл index.html не найден!", http.StatusNotFound)
			return
		}
		http.ServeFile(w, r, "index.html")
	})

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, w, r)
	})

	log.Printf("==================================================")
	log.Printf("CYBERCHORD Сервер запущен!")
	log.Printf("--> http://localhost:%s", port)
	log.Printf("--> http://127.0.0.1:%s", port)
	log.Printf("==================================================")

	if err := http.ListenAndServe("0.0.0.0:"+port, nil); err != nil {
		log.Fatal("Ошибка запуска сервера: ", err)
	}
}
