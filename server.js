const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");
const multer = require("multer");

// Инициализация сервера
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Настройка базы данных SQLite
const db = new sqlite3.Database("./chat.db", (err) => {
  if (err) {
    console.error("Ошибка базы данных:", err);
  } else {
    console.log("Подключено к SQLite");
    // Создаём таблицу сообщений, если её нет
    db.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        text TEXT,
        time TEXT NOT NULL,
        type TEXT DEFAULT 'text',
        file_path TEXT,
        is_deleted BOOLEAN DEFAULT 0
      )
    `);
  }
});

function handleEditMessage(data) {
  db.run(
    "UPDATE messages SET text = ? WHERE id = ?",
    [data.newText, data.messageId],
    (err) => {
      if (err) {
        console.error("Ошибка редактирования:", err);
        return;
      }

      broadcast({
        type: "edit",
        messageId: data.messageId,
        newText: data.newText,
      });
    }
  );
}

// Настройка загрузки файлов
const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// Middleware
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use(express.json());

// ======================
// REST API Endpoints
// ======================

// Получить все сообщения
app.get("/api/messages", (req, res) => {
  db.all(
    "SELECT * FROM messages WHERE is_deleted = 0 ORDER BY time ASC",
    [],
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Удалить сообщение (и файл, если есть)
app.delete("/api/files/delete", (req, res) => {
  const filePath = path.join(__dirname, req.query.path);
  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Ошибка удаления файла:", err);
      return res.status(500).json({ error: "Не удалось удалить файл" });
    }
    res.json({ success: true });
  });
});

// Загрузить файл
app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Файл не загружен" });
  }

  const fileExt = path.extname(req.file.originalname).toLowerCase();
  const newFileName = `${req.file.filename}${fileExt}`;
  const newFilePath = path.join("uploads", newFileName);

  fs.rename(req.file.path, newFilePath, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({
      success: true,
      filePath: `/uploads/${newFileName}`,
    });
  });
});

function handleEditMessage(data) {
  db.run(
    "UPDATE messages SET text = ? WHERE id = ?",
    [data.newText, data.messageId],
    (err) => {
      if (err) {
        console.error("Ошибка редактирования:", err);
        return;
      }

      broadcast({
        type: "edit",
        messageId: data.messageId,
        newText: data.newText,
      });
    }
  );
}

wss.on("connection", (ws) => {
  console.log("Новое подключение");

  // Отправляем историю сообщений новому клиенту
  db.all(
    "SELECT * FROM messages WHERE is_deleted = 0 ORDER BY time ASC LIMIT 100",
    [],
    (err, messages) => {
      if (err) {
        console.error("Ошибка загрузки сообщений:", err);
        return;
      }

      ws.send(JSON.stringify({ type: "history", messages }));
    }
  );

  // В обработчике WebSocket соединения добавьте:
  ws.on("message", (rawData) => {
    try {
      const data = JSON.parse(rawData);

      if (data.type === "edit") {
        db.run(
          "UPDATE messages SET text = ? WHERE id = ?",
          [data.newText, data.messageId],
          function (err) {
            if (err) {
              console.error("Ошибка редактирования:", err);
              return;
            }

            // Отправляем подтверждение всем клиентам
            broadcast({
              type: "edit",
              messageId: data.messageId,
              newText: data.newText,
              success: true,
            });
          }
        );
      }
    } catch (err) {
      console.error("Ошибка обработки сообщения:", err);
    }
  });
});

// ======================
// Helper Functions
// ======================

// Обработка нового сообщения
function handleNewMessage(data, ws) {
  const time = new Date().toLocaleTimeString();
  const messageData = {
    username: data.username,
    text: data.text,
    time: time,
    type: data.filePath ? "file" : "text",
    file_path: data.filePath || null,
  };

  db.run(
    "INSERT INTO messages (username, text, time, type, file_path) VALUES (?, ?, ?, ?, ?)",
    [
      messageData.username,
      messageData.text,
      messageData.time,
      messageData.type,
      messageData.file_path,
    ],
    function (err) {
      if (err) {
        console.error("Ошибка сохранения:", err);
        return;
      }

      messageData.id = this.lastID;

      // Рассылаем всем клиентам
      broadcast({
        type: "message",
        id: this.lastID,
        username: messageData.username,
        text: messageData.text,
        time: messageData.time,
        file_path: messageData.file_path,
        tempId: data.tempId,
      });
    }
  );
}

// Обработка удаления сообщения
function handleDeleteMessage(data) {
  db.get(
    "SELECT file_path FROM messages WHERE id = ?",
    [data.messageId],
    (err, row) => {
      if (err) {
        console.error("Ошибка поиска сообщения:", err);
        return;
      }

      // Удаляем из БД
      db.run("DELETE FROM messages WHERE id = ?", [data.messageId], (err) => {
        if (err) {
          console.error("Ошибка удаления:", err);
          return;
        }

        // Удаляем файл, если он есть
        if (row?.file_path) {
          fs.unlink(path.join(__dirname, row.file_path), (err) => {
            if (err) console.error("Ошибка удаления файла:", err);
          });
        }

        // Рассылаем всем клиентам
        broadcast({
          type: "delete",
          messageId: data.messageId,
        });
      });
    }
  );
}

// Отправка данных всем клиентам
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
