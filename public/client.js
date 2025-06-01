const usernameInput = document.getElementById("username");
const loginBtn = document.getElementById("login-btn");
const loginContainer = document.getElementById("login-container");
const chatContainer = document.getElementById("chat-container");
const messagesDiv = document.getElementById("messages");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const emojiBtn = document.getElementById("emoji-btn");
const fileBtn = document.getElementById("file-btn");
const fileInput = document.getElementById("file-input");
const emojiPicker = document.getElementById("emoji-picker");

let socket;
let currentUsername = "";

// Emoji list
const emojis = ["😀", "😂", "😍", "👍", "👋", "🎉", "❤️", "🔥", "🤔", "👀"];

function createMediaHTML(filePath, fileName) {
  const ext = filePath.split(".").pop().toLowerCase();

  if (["jpg", "jpeg", "png", "gif"].includes(ext)) {
    return `<img src="${filePath}" alt="Изображение" class="message-image" onload="this.parentElement.scrollIntoView()">`;
  } else if (["mp3", "wav", "ogg"].includes(ext)) {
    return `
      <div class="audio-message">
        <audio controls onloadeddata="this.parentElement.scrollIntoView()">
          <source src="${filePath}" type="audio/${
      ext === "mp3" ? "mpeg" : ext
    }">
        </audio>
        <div class="file-name">${fileName}</div>
      </div>
    `;
  } else if (["mp4", "webm", "mov"].includes(ext)) {
    return `
      <div class="video-message">
        <video controls onloadeddata="this.parentElement.scrollIntoView()">
          <source src="${filePath}" type="video/${ext === "mp4" ? "mp4" : ext}">
        </video>
        <div class="file-name">${fileName}</div>
      </div>
    `;
  }
  return `<div class="file-message">Файл: ${fileName}</div>`;
}

function addMessage(message) {
  const msgElement = document.createElement("div");
  msgElement.className = "message";
  msgElement.dataset.id = message.id;
  if (message.tempId) {
    const tempMessage = document.querySelector(
      `.message[data-id="${message.tempId}"]`
    );
    if (tempMessage) {
      tempMessage.remove();
    }
  }
  let contentHTML = "";
  if (message.file_path) {
    if (message.file_path.match(/\.(mp3|wav|ogg)$/i)) {
      contentHTML = `
        <audio controls class="message-audio">
          <source src="${message.file_path}" type="audio/mpeg">
          Your browser does not support the audio element.
        </audio>
      `;
    } else if (message.file_path.match(/\.(mp4|webm|mov)$/i)) {
      contentHTML = `
        <video controls class="message-video">
          <source src="${message.file_path}" type="video/mp4">
          Your browser does not support the video element.
        </video>
      `;
    } else {
      contentHTML = `<img src="${message.file_path}" alt="File" class="message-image">`;
    }
  } else {
    contentHTML = `<div class="text">${message.text}</div>`;
  }

  msgElement.innerHTML = `
    <div class="message-header">
      <span class="username">${message.username}</span>
      <span class="time">${message.time}</span>
      ${
        currentUsername === message.username
          ? `
        <button class="edit-btn" data-id="${message.id}">✏️</button>
        <button class="delete-btn" data-id="${message.id}">🗑️</button>
      `
          : ""
      }
    </div>
    ${contentHTML}
    <div class="message-edit-container" id="edit-container-${
      message.id
    }" style="display: none;">
      <input type="text" class="edit-input" value="${message.text || ""}">
      <button class="save-edit-btn round-btn" data-id="${message.id}">✓</button>
      <button class="cancel-edit-btn round-btn" data-id="${
        message.id
      }">✕</button>
    </div>
  `;

  messagesDiv.appendChild(msgElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Add event listeners for buttons
  const deleteBtn = msgElement.querySelector(".delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => deleteMessage(message.id));
  }

  const editBtn = msgElement.querySelector(".edit-btn");
  if (editBtn) {
    editBtn.addEventListener("click", () => showEditForm(message.id));
  }

  const saveEditBtn = msgElement.querySelector(".save-edit-btn");
  if (saveEditBtn) {
    saveEditBtn.addEventListener("click", () => saveEdit(message.id));
  }

  const cancelEditBtn = msgElement.querySelector(".cancel-edit-btn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => cancelEdit(message.id));
  }
}

function addSystemMessage(text) {
  const sysElement = document.createElement("div");
  sysElement.className = "system-message";
  sysElement.textContent = text;
  messagesDiv.appendChild(sysElement);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function deleteMessage(messageId) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "delete",
        messageId: messageId,
      })
    );
  }
}

function showEditForm(messageId) {
  const editContainer = document.getElementById(`edit-container-${messageId}`);
  if (editContainer) {
    editContainer.style.display = "flex";
    editContainer.querySelector(".edit-input").focus();
  }
}

function cancelEdit(messageId) {
  const editContainer = document.getElementById(`edit-container-${messageId}`);
  if (editContainer) {
    editContainer.style.display = "none";
  }
}

function saveEdit(messageId) {
  const editInput = document.querySelector(
    `#edit-container-${messageId} .edit-input`
  );
  if (!editInput || !socket || socket.readyState !== WebSocket.OPEN) return;

  const newText = editInput.value.trim();
  if (!newText) return;

  socket.send(
    JSON.stringify({
      type: "edit",
      messageId: messageId,
      newText: newText,
    })
  );

  // Закрываем форму редактирования сразу
  cancelEdit(messageId);
}

function connect() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${window.location.host}`);

  socket.onopen = () => {
    console.log("Connected to server");
    if (currentUsername) {
      addSystemMessage(`Вы вошли как ${currentUsername}`);
    }
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "history") {
      data.messages.forEach((msg) => {
        addMessage(msg);
      });
    } else if (data.type === "message") {
      addMessage(data);
    } else if (data.type === "delete") {
      const messageElement = document.querySelector(
        `.message[data-id="${data.messageId}"]`
      );
      if (messageElement) {
        messageElement.remove();
      }
    } else if (data.type === "edit") {
      const messageElement = document.querySelector(
        `.message[data-id="${data.messageId}"] .text`
      );
      if (messageElement) {
        messageElement.textContent = data.newText;
      }
      cancelEdit(data.messageId);
    }
  };

  socket.onclose = () => {
    addSystemMessage("Соединение прервано. Переподключаемся...");
    setTimeout(connect, 3000);
  };
}

function showEmojiPicker() {
  emojiPicker.innerHTML = emojis
    .map((emoji) => `<span class="emoji-option">${emoji}</span>`)
    .join("");
  emojiPicker.style.display =
    emojiPicker.style.display === "block" ? "none" : "block";

  document.querySelectorAll(".emoji-option").forEach((emoji) => {
    emoji.addEventListener("click", () => {
      messageInput.value += emoji.textContent;
      emojiPicker.style.display = "none";
      messageInput.focus();
    });
  });
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    return await response.json();
  } catch (error) {
    console.error("Error uploading file:", error);
    return null;
  }
}

async function handleFileUpload() {
  const file = fileInput.files[0];
  if (!file) return;

  // Создаем временное сообщение для мгновенного отображения
  const tempId = Date.now();
  const time = new Date().toLocaleTimeString();
  const tempMessage = {
    id: tempId,
    username: currentUsername,
    text: file.name,
    time: time,
    isTemp: true,
    file_path: "temp-path", // Временный путь
  };

  addMessage(tempMessage); // Мгновенно показываем сообщение

  const uploadResult = await uploadFile(file);
  if (uploadResult && uploadResult.success) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "message",
          username: currentUsername,
          text: file.name,
          filePath: uploadResult.filePath,
          tempId: tempId, // Отправляем временный ID на сервер
        })
      );
    }
  }
  fileInput.value = "";
}

// Event listeners
loginBtn.addEventListener("click", () => {
  const username = usernameInput.value.trim();
  if (username) {
    currentUsername = username;
    localStorage.setItem("username", username);
    document.querySelector(".main-container").style.display = "none";
    chatContainer.style.display = "block";
    connect();
    messageInput.focus();
  }
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    sendMessage();
  }
});

function sendMessage() {
  const text = messageInput.value.trim();
  if (text && socket && socket.readyState === WebSocket.OPEN) {
    // Создаем временное сообщение для мгновенного отображения
    const tempId = Date.now(); // Временный ID
    const time = new Date().toLocaleTimeString();
    const tempMessage = {
      id: tempId,
      username: currentUsername,
      text: text,
      time: time,
      isTemp: true,
    };

    addMessage(tempMessage); // Мгновенно показываем сообщение

    socket.send(
      JSON.stringify({
        type: "message",
        username: currentUsername,
        text: text,
        tempId: tempId, // Отправляем временный ID на сервер
      })
    );
    messageInput.value = "";
  }
}

emojiBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  showEmojiPicker();
});

fileBtn.addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", handleFileUpload);

// Close emoji picker when clicking outside
document.addEventListener("click", () => {
  emojiPicker.style.display = "none";
});

// Initialize
if (localStorage.getItem("username")) {
  usernameInput.value = localStorage.getItem("username");
}
