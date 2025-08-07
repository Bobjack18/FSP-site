import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence, updateProfile, sendPasswordResetEmail, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, get, query, orderByChild, equalTo, serverTimestamp, remove, onChildAdded, update, off } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";
import { getRemoteConfig, fetchAndActivate, getValue } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-remote-config.js"; // <--- ADD THIS LINE

// --- Initialize EmailJS and register service-worker AFTER module imports ---
(function () {
  emailjs.init({
    publicKey: 'ht7XX9d6xGC-H_Fd0', // <--- THIS IS KEY!
  });
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./service-worker.js')
      .then((reg) => console.log('SW registered', reg))
      .catch((err) => console.error('SW registration failed', err));
  });
}



 const firebaseConfig = {
 apiKey: "AIzaSyAiOxlFuVTJdhZaq7Zaysk_J5y7qWOrjfg",
 authDomain: "flatbushsp.firebaseapp.com",
 projectId: "flatbushsp",
 storageBucket: "flatbushsp.appspot.com",
 messagingSenderId: "476872795900",
 appId: "1:476872795900:web:50cdbed8d0273407639979",
 measurementId: "G-8XPZF1BFLB"
 };


 const app = initializeApp(firebaseConfig);
 const auth = getAuth(app);
window.auth = auth; // This makes your 'auth' object globally accessible for testing
window.database = database; // Do the same for 'database' if you want to use it in console
 const database = getDatabase(app);
const remoteConfig = getRemoteConfig(app); // Initialize remoteConfig!
 remoteConfig.minimumFetchIntervalMillis = 0; // Crucial for quick testing, set to 0 for development
 remoteConfig.defaultConfig = { // Provide a default value, important if Firebase isn't reachable
 chat_password: "default_password" // Use a placeholder here
 };
// Global variables for DM functionality
let currentDmRecipientUid = null;
let currentDmRecipientName = null;
let dmMessagesRef = null; // Reference to the current DM conversation in Firebase
let dmMessagesListener = null; // Listener for direct messages
 setPersistence(auth, browserLocalPersistence).catch(console.error);


const ADMIN_EMAIL = 'flatbushpatrol101@gmail.com'; // Replace with the actual admin email

 // =================== Presence Logic ====================
 const presenceCache = {}; // cache for presence status


 function updatePresenceFromLoginHistory() {
 const logRef = ref(database, 'logins');
 onValue(logRef, (snap) => {
 const data = snap.val() || {};
 const now = Date.now();
 Object.values(data).forEach(login => {
  const loginTime = login.timestamp || 0;
  const displayName = login.displayName || login.email || 'User';
  presenceCache[displayName] = (now - loginTime) < 5*60*1000 ? 'online' : 'offline';
 });
 });
 }
 setInterval(updatePresenceFromLoginHistory, 60000);
 updatePresenceFromLoginHistory();

 // =================== Theme toggle ====================
 const themeToggle = document.getElementById('theme-toggle');
 const body = document.body;
 const savedTheme = localStorage.getItem('theme');
 if (savedTheme === 'light') {
 body.classList.remove('dark-theme');
 body.classList.add('light-theme');
 if (themeToggle) themeToggle.checked = true;
 } else {
 body.classList.remove('light-theme');
 body.classList.add('dark-theme');
 if (themeToggle) themeToggle.checked = false;
 }
 if (themeToggle) {
 themeToggle.addEventListener('change', () => {
 if (themeToggle.checked) {
  body.classList.remove('dark-theme');
  body.classList.add('light-theme');
  localStorage.setItem('theme', 'light');
 } else {
  body.classList.remove('light-theme');
  body.classList.add('dark-theme');
  localStorage.setItem('theme', 'dark');
 }
 });
 }


 // Helper functions
 function getInitials(nameOrEmail) {
 if (!nameOrEmail) return 'U';
 const parts = nameOrEmail.trim().split(' ');
 if (parts.length === 1) {
 return parts[0].charAt(0).toUpperCase();
 } else {
 return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
 }
 }


 function getColorFromName(name) {
 let hash = 0;
 for (let i=0; i<name.length; i++) {
 hash = name.charCodeAt(i) + ((hash << 5) - hash);
 hash = hash & hash;
 }
 const hue = Math.abs(hash) % 360;
 return `hsl(${hue}, 70%, 50%)`;
 }


 function createAvatar(nameOrEmail) {
 const avatarDiv = document.createElement('div');
 avatarDiv.className = 'avatar';


 const currentUser = auth.currentUser;
 // This logic assumes `nameOrEmail` matches the *current* logged-in user's
 // display name or email. If you want other users' actual avatars to appear
 // in chat, you'd need to store their photoURLs in your Realtime Database
 // alongside their messages or user profiles, and retrieve them here.
 if (currentUser &&
 (currentUser.displayName === nameOrEmail || currentUser.email === nameOrEmail) &&
 currentUser.photoURL) {
 avatarDiv.style.backgroundImage = `url('${currentUser.photoURL}')`;
 avatarDiv.style.backgroundSize = 'cover';
 avatarDiv.style.backgroundPosition = 'center';
 avatarDiv.innerText = ''; // No initials if using an image
 } else {
 // Fallback to initials and color
 const initials = getInitials(nameOrEmail);
 avatarDiv.innerText = initials;
 avatarDiv.style.backgroundColor = getColorFromName(nameOrEmail);
 avatarDiv.style.backgroundImage = 'none'; // Ensure no lingering background image
 }
 return avatarDiv;
}


 let editingMessageId = null;
 let lastLoginTimestamp = 0;


 document.addEventListener('DOMContentLoaded', () => {
 // Show sections
 function showSection(id) {
 document.querySelectorAll('.container').forEach(c => c.classList.add('hidden'));
 document.getElementById(id).classList.remove('hidden');
 }


 // Navigation event handlers
 document.getElementById('show-login').onclick = () => {
 showSection('login-form');
 document.getElementById('login-error').innerText = '';
 };
 document.getElementById('show-signup').onclick = () => showSection('signup-form');
 document.getElementById('to-signup').onclick = () => showSection('signup-form');
 document.getElementById('to-welcome').onclick = () => showSection('welcome-screen');
 document.getElementById('to-welcome2').onclick = () => showSection('welcome-screen');


 // Login
 document.getElementById('login-submit').onclick = () => {
 const email = document.getElementById('login-email').value.trim().toLowerCase();
 const password = document.getElementById('login-password').value;
 const errorDiv = document.getElementById('login-error');
 errorDiv.innerText = '';


 const remember = document.getElementById('remember-me').checked;


 signInWithEmailAndPassword(auth, email, password).then(() => {
  if (remember) {
  localStorage.setItem('savedEmail', email);
  } else {
  localStorage.removeItem('savedEmail');
  }
  // Log login event
  push(ref(database, 'logins'), {
  email: auth.currentUser.email,
  displayName: auth.currentUser.displayName || '',
  timestamp: Date.now()
  });
 }).catch(() => {
  errorDiv.innerText = 'Invalid email or password!';
 });
 };


 // Fill saved email
 const savedEmail = localStorage.getItem('savedEmail');
 if (savedEmail) {
 document.getElementById('login-email').value = savedEmail;
 document.getElementById('remember-me').checked = true;
 }
// Sign Up (MODIFIED)
document.getElementById('signup-submit').onclick = () => {
 const name = document.getElementById('signup-name').value.trim();
 const email = document.getElementById('signup-email').value.trim().toLowerCase();
 const password = document.getElementById('signup-password').value;
 createUserWithEmailAndPassword(auth, email, password).then((cred) => {
 if (cred.user) {
 updateProfile(cred.user, { displayName: name }).then(() => {
  // !! ADD: Push signup info to RTDB after successful signup and profile update
  push(ref(database, 'signups'), {
  uid: cred.user.uid, // Store user ID
  name: name, // Store display name
  email: email, // Store email
  timestamp: serverTimestamp() // Store server timestamp
  }).catch(e => console.error("Failed to log signup:", e)); // Log errors if push fails


  document.getElementById('welcome-message').innerText = `Welcome, ${name}!`;
  document.getElementById('user-name').innerText = name;
  updateWelcomeAvatar(name); // Update welcome avatar
  showSection('main-content'); // Go to main content
 }).catch((e) => {
  alert('Error setting display name: ' + e.message);
  // Even if name update fails, log the signup with available info
  push(ref(database, 'signups'), {
  uid: cred.user.uid,
  name: name || 'N/A', // Use provided name or 'N/A'
  email: email,
  timestamp: serverTimestamp()
  }).catch(e => console.error("Failed to log signup after profile update error:", e));


  document.getElementById('welcome-message').innerText = `Welcome, ${name}!`;
  document.getElementById('user-name').innerText = name;
  updateWelcomeAvatar(name);
  showSection('main-content');
 });
 }
 }).catch((e) => {
 // Handle existing email error specifically
 if (e.code === 'auth/email-already-in-use') {
  alert("Email already registered. Please log in.");
  showSection('login-form'); // Direct them to login form
 }
 else {
  alert("Signup failed: " + e.message); // Show other errors
 }
 });
};
 // Logout
 document.getElementById('logout').onclick = () => {
 signOut(auth);
 };


 // Section navigation
 document.getElementById('units-button').onclick = () => showSection('units-screen');
 document.getElementById('back-from-units').onclick = () => showSection('main-content');
 document.getElementById('codes-button').onclick = () => showSection('codes-screen');
 document.getElementById('back-from-codes').onclick = () => showSection('main-content');


 // Send message in chat 1
 document.getElementById('send-button').onclick = () => {
 const user = auth.currentUser;
 if (!user) {
  alert("Please log in to send messages.");
  showSection('login-form');
  return;
 }
 const input = document.getElementById('message-input');
 const text = input.value.trim();
 if (!text) return;

 if (editingMessageId) {
  update(ref(database, 'messages/' + editingMessageId), { text }).then(() => {
   editingMessageId = null;
   input.value = '';
   document.getElementById('cancel-edit').classList.add('hidden');
  }).catch(e => alert('Error updating message: ' + e.message));
 } else {
  push(ref(database, 'messages'), {
  text,
  timestamp: serverTimestamp(),
  sender: user.displayName || user.email || 'Anonymous'
  }).then(() => {
  input.value = '';


  }).catch(e => alert('Error sending message: ' + e.message));
 }
 };
 // --- NEW: Function to check chat password with Remote Config & "Remember Me" ---
 async function checkChatPassword(chatType) {
 const user = auth.currentUser;
 if (!user) {
  alert("Please log in to use the chat.");
  showSection('login-form');
  return false;
 }


 // Define how long to remember the password (1 week in milliseconds)
 const ONE_WEEK_MILLIS = 7 * 24 * 60 * 60 * 1000; // 7 days


 // Create a unique key for storing the timestamp for this chat type and user
 // This prevents one user's remembered password from affecting another's,
 // and ensures different chat types have separate memory.
 const localStorageKey = `chat_password_remember_${chatType}_${user.uid}`;
 
 const lastAccessedTime = localStorage.getItem(localStorageKey);
 const currentTime = Date.now();


 // Check if the password was remembered recently
 if (lastAccessedTime) {
  if (currentTime - parseInt(lastAccessedTime, 10) < ONE_WEEK_MILLIS) {
  console.log("Password remembered! Access granted for " + chatType);
  // If remembered, proceed to show the appropriate chat screen
  if (chatType === 'messages') {
  showSection('chat-screen');
  loadMessages();
listenForTypingStatus('messages', 'chat1-typing-indicator'); // Start listening for typing on Chat 1


  } else if (chatType === 'messages_v2') {
  showSection('chat2-screen');
  loadMessages2();
listenForTypingStatus('messages_v2', 'chat2-typing-indicator'); // Start listening for typing on Chat 2


  }
  // Update the timestamp to reset the "week" countdown, extending access
  localStorage.setItem(localStorageKey, currentTime.toString());
  return true;
  } else {
  // If more than a week has passed, clear the old timestamp
  console.log("Remembered password expired for " + chatType);
  localStorage.removeItem(localStorageKey);
  }
 }


 // If not remembered or expired, proceed with fetching from Remote Config and prompting
 try {
  console.log("Fetching Remote Config for chat password...");
  await fetchAndActivate(remoteConfig);
  const storedPassword = getValue(remoteConfig, 'chat_password').asString();
  console.log("Remote Config fetched. Prompting for password...");


  const enteredPassword = prompt("Please enter the chat password:");


  if (enteredPassword === storedPassword) {
  console.log("Password correct! Access granted.");
  
  // Store the current time in local storage to remember for a week
  localStorage.setItem(localStorageKey, currentTime.toString());


  // Proceed to show the appropriate chat screen
  if (chatType === 'messages') {
  showSection('chat-screen');
  loadMessages();
  } else if (chatType === 'messages_v2') {
  showSection('chat2-screen');
  loadMessages2();
  }
  return true;
  } else {
  alert("Incorrect chat password. Access denied.");
  return false;
  }
 } catch (error) {
  console.error("Error fetching Remote Config or checking password:", error);
  alert("Could not check chat password. Please try again later or contact support.");
  return false;
 }
 }
 // --- END NEW: Function to check chat password with Remote Config & "Remember Me" ---


 document.getElementById('chat-button').onclick = () => {
 // Instead of directly showing the chat, we call our new function
 checkChatPassword('messages'); // 'messages' tells the function which chat to try to open
 };
 document.getElementById('chat2-button').onclick = () => {
 // Same for Chat 2.0, call the password check function
 checkChatPassword('messages_v2'); // 'messages_v2' tells the function which chat to try to open
 };
 document.getElementById('back-to-main').onclick = () => showSection('main-content');
 document.getElementById('back-to-main2').onclick = () => showSection('main-content');
// =================== EVENT LISTENERS (add these inside the existing DOMContentLoaded listener) ===================


 // Direct Messages Button on Main Content
 document.getElementById('direct-messages-button').addEventListener('click', async () => {
  showSection('dm-screen');
  document.getElementById('dm-user-list').classList.remove('hidden'); // Show user list first
  document.getElementById('dm-conversation-area').classList.add('hidden'); // Hide conversation area
  await loadDmUsers(); // Load users when navigating to DM screen
 });


 // Back from DM screen (returns to main content)
 document.getElementById('back-from-dm').addEventListener('click', () => {
  showSection('main-content');
  // Clean up DM listener if returning from a conversation
  if (dmMessagesListener) {
  off(dmMessagesListener);
  dmMessagesListener = null;
  }
  currentDmRecipientUid = null;
  currentDmRecipientName = null;
  dmMessagesRef = null;
 });


 // New DM button (shows user list again if in a conversation)
 document.getElementById('new-dm-button').addEventListener('click', async () => {
  document.getElementById('dm-user-list').classList.remove('hidden');
  document.getElementById('dm-conversation-area').classList.add('hidden');
  // Clean up DM listener if starting a new DM from existing conversation
  if (dmMessagesListener) {
  off(dmMessagesListener);
  dmMessagesListener = null;
  }
  currentDmRecipientUid = null;
  currentDmRecipientName = null;
  dmMessagesRef = null;
  await loadDmUsers();
 });


 // Back from DM Conversation to User List
 document.getElementById('back-from-conversation').addEventListener('click', () => {
  document.getElementById('dm-user-list').classList.remove('hidden');
  document.getElementById('dm-conversation-area').classList.add('hidden');
  // Clean up DM listener
  if (dmMessagesListener) {
  off(dmMessagesListener);
  dmMessagesListener = null;
  }
  currentDmRecipientUid = null;
  currentDmRecipientName = null;
  dmMessagesRef = null;
 });


 // Send DM message button click
 document.getElementById('dm-send-button').addEventListener('click', sendDirectMessage);


 // Send DM message on Enter key press
 document.getElementById('dm-message-input').addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { // Allow Shift+Enter for new line
  e.preventDefault(); // Prevent default Enter behavior (new line)
  sendDirectMessage();
  }
 });


  // --- Function to send message in Chat 2.0 ---
 function sendMessageFromChat2() {
 const user = auth.currentUser;
 if (!user) {
  alert("Please log in to send messages.");
  showSection('login-form'); // Go back to login if not logged in
  return;
 }
 const input = document.getElementById('message-input2');
 const text = input.value.trim();
 if (!text) return; // Don't send empty messages


 if (editingMessageId) {
  // If we are editing a message, update it
  update(ref(database, 'messages_v2/' + editingMessageId), { text }).then(() => {
  // Clear editing state after update
  editingMessageId = null;
  input.value = '';
  document.getElementById('cancel-edit2').classList.add('hidden');
  }).catch(e => alert('Error updating message: ' + e.message));
 } else {
  // If sending a new message, push it to the database
  push(ref(database, 'messages_v2'), {
  text,
  timestamp: serverTimestamp(), // Use server timestamp for reliability
  sender: user.displayName || user.email || 'Anonymous' // Use displayName first, fallback to email or 'Anonymous'
  }).then(() => {
  // Clear input field after sending
  input.value = '';
  }).catch(e => alert('Failed to send message: ' + e.message)); // Provide feedback on error
 }
 }
 // --- End Function to send message in Chat 2.0 ---


 // --- Event listeners for Chat 2.0 Send ---
 // Send message in chat 2 when button clicked
 document.getElementById('send-button2').addEventListener('click', sendMessageFromChat2);


 // Send message in chat 2 when icon clicked
 document.getElementById('send-icon2').addEventListener('click', sendMessageFromChat2);


 // Optional: Also send message when Enter key is pressed in the input field (allows Shift+Enter for newline)
 document.getElementById('message-input2').addEventListener('keypress', (event) => {
  // Check for Enter key (key code 13) and ensure Shift key is NOT pressed
  if (event.key === 'Enter' && !event.shiftKey) {
  event.preventDefault(); // Prevent default newline character
  sendMessageFromChat2(); // Call the send message function
  }
 });
 // --- End Event listeners for Chat 2.0 Send ---


 // =================== loadMessages ====================
 function loadMessages() {
 const refMessages = ref(database, 'messages');
 const container = document.getElementById('messages');
 console.log('Loading messages from:', refMessages.toString()); // Debug


 container.innerHTML = '';


 onValue(refMessages, (snap) => {
 const msgs = snap.val() || {};
 console.log('Snapshot data:', msgs); // Debug


 // Clear previous messages
 container.innerHTML = '';


 const currentUser = auth.currentUser;
 const isAdmin = currentUser && currentUser.email?.toLowerCase() === 'flatbushpatrol101@gmail.com';


 Object.entries(msgs).forEach(([id, msg]) => {
 const senderEmail = msg.sender || '';
 const senderName = msg.sender || 'User';


 const isSelf = currentUser && (currentUser.email === senderEmail || currentUser.displayName === senderName);


 // Create message container
 const msgDiv = document.createElement('div');
 msgDiv.className = 'message-container' + (isSelf ? ' self' : '');


 // Create message bubble
 const bubble = document.createElement('div');
 bubble.className = 'message-bubble ' + (isSelf ? 'user' : 'other');
 bubble.style.position = 'relative';


 // Admin controls
 if (isAdmin) {
  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn';
  deleteBtn.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/1214/1214428.png" alt="Delete" />`;
  // deleteBtn.title = "Delete";


  deleteBtn.onclick = () => {
  if (confirm("Are you sure you want to delete this message?")) {
  remove(ref(database, 'messages/' + id));
  }
  };


  // Create edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.innerHTML = `<img src="https://i.ibb.co/gbBZWrTj/images.png" alt="Edit" />`;
  editBtn.title = "Edit";


  editBtn.onclick = () => {
  editingMessageId = id;
  document.getElementById('message-input').value = msg.text;
  document.getElementById('message-input').focus();
  document.getElementById('cancel-edit').classList.remove('hidden');
  };


  // Controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'action-buttons';
  controlsDiv.appendChild(editBtn);
  controlsDiv.appendChild(deleteBtn);


  // Append controls to bubble
  bubble.appendChild(controlsDiv);
 }
 // User's own messages can delete
 else if (currentUser && (currentUser.email === senderEmail || currentUser.displayName === senderName)) {
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerText = 'Delete';
  deleteBtn.onclick = () => {
  remove(ref(database, 'messages/' + id));
  };
  bubble.appendChild(deleteBtn);
 }


 // Sender info (avatar + name)
 const senderInfo = document.createElement('div');
 senderInfo.className = 'sender-info';


 const avatar = createAvatar(senderName);
 senderInfo.appendChild(avatar);


 const senderNameDiv = document.createElement('div');
 senderNameDiv.className = 'sender-name';
 senderNameDiv.innerText = senderName;


 senderInfo.appendChild(senderNameDiv);
 bubble.appendChild(senderInfo);


 // Message text
 const textDiv = document.createElement('div');
 textDiv.innerText = msg.text;


 // Append message text
 bubble.appendChild(textDiv);

 // Add map if message has location (from incident reports)
 if (msg.location) {
  const mapDiv = document.createElement('div');
  mapDiv.style.width = '120px';
  mapDiv.style.height = '80px';
  mapDiv.style.cursor = 'pointer';
  mapDiv.style.marginTop = '8px';
  mapDiv.style.borderRadius = '8px';
  mapDiv.style.overflow = 'hidden';
  mapDiv.className = 'mini-map';
  bubble.appendChild(mapDiv);
  
  // Initialize small map after element is in DOM
  setTimeout(() => {
  const map = L.map(mapDiv, { 
  attributionControl: false, 
  zoomControl: false, 
  dragging: false, 
  scrollWheelZoom: false 
  }).setView([msg.location.lat, msg.location.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  L.marker([msg.location.lat, msg.location.lng]).addTo(map);
  mapDiv.onclick = () => showBigMap(msg.location);
  }, 100);

  if (msg.address) {
  const addressDiv = document.createElement('div');
  addressDiv.className = 'message-address';
  addressDiv.innerText = msg.address;
  addressDiv.style.fontSize = '12px';
  addressDiv.style.color = '#666';
  addressDiv.style.marginTop = '4px';
  bubble.appendChild(addressDiv);
  }
 }

 // Append bubble to message container
 // --- NEW: Add the reaction bar HTML dynamically ---
const reactionBar = document.createElement('div');
reactionBar.className = 'reaction-bar'; // Your CSS targets this class
reactionBar.innerHTML = `
 <button class="reaction-btn">ðŸ‘</button>
 <button class="reaction-btn">â¤ï¸</button>
 <button class="reaction-btn">ðŸ˜‚</button>
 <!-- Add more reaction buttons as you like -->
`;
bubble.appendChild(reactionBar); // Append the reaction bar to the bubble
// --- END NEW ---




msgDiv.appendChild(bubble);
 container.appendChild(msgDiv);
 });


 // Auto-scroll to latest message
 setTimeout(() => {
 document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
 }, 100);
 });
}
 // loadMessages2 similar...
 function loadMessages2() {
 const refMessages = ref(database, 'messages_v2');
 const container = document.getElementById('messages2');
 console.log('Loading messages from:', refMessages.toString()); // Debug


 container.innerHTML = '';


 onValue(refMessages, (snap) => {
 const msgs = snap.val() || {};
 console.log('Messages v2:', msgs); // Debug


 // Clear previous messages
 container.innerHTML = '';


 const currentUser = auth.currentUser;
 const isAdmin = currentUser && currentUser.email?.toLowerCase() === 'flatbushpatrol101@gmail.com';


 Object.entries(msgs).forEach(([id, msg]) => {
 const senderEmail = msg.sender || '';
 const senderName = msg.sender || 'User';


 const isSelf = currentUser && (currentUser.email === senderEmail || currentUser.displayName === senderName);


 // Create message container
 const msgDiv = document.createElement('div');
 msgDiv.className = 'message-container' + (isSelf ? ' self' : '');


 // Create message bubble
 const bubble = document.createElement('div');
 bubble.className = 'message-bubble ' + (isSelf ? 'user' : 'other');
 bubble.style.position = 'relative';


 // Admin controls
 if (isAdmin) {
  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn';
  deleteBtn.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/1214/1214428.png" alt="Delete" />`;
 // deleteBtn.title = "Delete";
  deleteBtn.onclick = () => {
  if (confirm("Are you sure you want to delete this message?")) {
  remove(ref(database, 'messages_v2/' + id));
  }
  };


  // Create edit button
  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.innerHTML = `<img src="https://cdn-icons-png.flaticon.com/512/5356/5356118.png" alt="Edit" />`;
  editBtn.title = "Edit";
  editBtn.onclick = () => {
  editingMessageId = id;
  document.getElementById('message-input2').value = msg.text;
  document.getElementById('message-input2').focus();
  document.getElementById('cancel-edit2').classList.remove('hidden');
  };


  // Controls container
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'action-buttons';
  controlsDiv.appendChild(editBtn);
  controlsDiv.appendChild(deleteBtn);


  // Append controls to bubble
  bubble.appendChild(controlsDiv);
 }
 // User's own messages can delete
 else if (currentUser && (currentUser.email === senderEmail || currentUser.displayName === senderName)) {
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.innerText = 'Delete';
  deleteBtn.onclick = () => {
  remove(ref(database, 'messages_v2/' + id));
  };
  bubble.appendChild(deleteBtn);
 }


 // Sender info (avatar + name)
 const senderInfo = document.createElement('div');
 senderInfo.className = 'sender-info';


 const avatar = createAvatar(senderName);
 senderInfo.appendChild(avatar);


 const senderNameDiv = document.createElement('div');
 senderNameDiv.className = 'sender-name';
 senderNameDiv.innerText = senderName;


 senderInfo.appendChild(senderNameDiv);
 bubble.appendChild(senderInfo);


 // Message text
 const textDiv = document.createElement('div');
 textDiv.innerText = msg.text;


 // Append message text
 bubble.appendChild(textDiv);

 // Add map if message has location (from incident reports)
 if (msg.location) {
  const mapDiv = document.createElement('div');
  mapDiv.style.width = '120px';
  mapDiv.style.height = '80px';
  mapDiv.style.cursor = 'pointer';
  mapDiv.style.marginTop = '8px';
  mapDiv.style.borderRadius = '8px';
  mapDiv.style.overflow = 'hidden';
  mapDiv.className = 'mini-map';
  bubble.appendChild(mapDiv);
  
  // Initialize small map after element is in DOM
  setTimeout(() => {
  const map = L.map(mapDiv, { 
  attributionControl: false, 
  zoomControl: false, 
  dragging: false, 
  scrollWheelZoom: false 
  }).setView([msg.location.lat, msg.location.lng], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  L.marker([msg.location.lat, msg.location.lng]).addTo(map);
  mapDiv.onclick = () => showBigMap(msg.location);
  }, 100);

  if (msg.address) {
  const addressDiv = document.createElement('div');
  addressDiv.className = 'message-address';
  addressDiv.innerText = msg.address;
  addressDiv.style.fontSize = '12px';
  addressDiv.style.color = '#666';
  addressDiv.style.marginTop = '4px';
  bubble.appendChild(addressDiv);
  }
 }

 // Append bubble to message container
 msgDiv.appendChild(bubble);
 container.appendChild(msgDiv);
 });


 // Auto-scroll to latest message
 setTimeout(() => {
 document.getElementById('messages2').scrollTop = document.getElementById('messages2').scrollHeight;
 }, 100);
 });
}
 // =================== Avatar Upload Logic ====================
 const avatarFileInput = document.getElementById('avatar-file-input');
 const avatarPreview = document.getElementById('avatar-preview');
 const avatarPlaceholder = document.getElementById('avatar-placeholder');
 const uploadAvatarBtn = document.getElementById('upload-avatar-btn');
 const avatarUploadStatus = document.getElementById('avatar-upload-status');


 let selectedAvatarFile = null; // To store the file chosen by the user


 // Handle file selection and display preview
 avatarFileInput.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
  selectedAvatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
   avatarPreview.src = e.target.result;
   avatarPreview.style.display = 'block';
   avatarPlaceholder.style.display = 'none';
  };
  reader.readAsDataURL(file);
  avatarUploadStatus.textContent = `File selected: ${file.name}`;
  avatarUploadStatus.style.color = '#fff';
  } else {
  selectedAvatarFile = null;
  avatarPreview.src = '';
  avatarPreview.style.display = 'none';
  avatarPlaceholder.style.display = 'block';
  avatarUploadStatus.textContent = 'No file selected.';
  avatarUploadStatus.style.color = '#aaa';
  }
 });


 // Handle avatar upload to imgbb
 uploadAvatarBtn.addEventListener('click', async () => {
  const user = auth.currentUser;
  if (!user) {
  avatarUploadStatus.textContent = 'Please log in to upload an avatar.';
  avatarUploadStatus.style.color = 'red';
  return;
  }


  if (!selectedAvatarFile) {
  avatarUploadStatus.textContent = 'Please select an image first.';
  avatarUploadStatus.style.color = 'orange';
  return;
  }


  avatarUploadStatus.textContent = 'Uploading...';
  avatarUploadStatus.style.color = '#32cd32'; // Neon green for status


  const apiKey = '6c210d991c8a37528141924040680b2e'; // Your imgbb API key


  const formData = new FormData();
  formData.append('image', selectedAvatarFile); // 'image' is the field name imgbb expects


  try {
  const response = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
   method: 'POST',
   body: formData
  });


  const data = await response.json();


  if (response.ok && data.success) {
   const imageUrl = data.data.url;
   
   // Update Firebase Authentication profile with the new photoURL
   await updateProfile(user, { photoURL: imageUrl });


   avatarUploadStatus.textContent = 'Avatar uploaded and profile updated successfully!';
   avatarUploadStatus.style.color = '#32cd32'; // Success color


   // Immediately update the main welcome avatar
   updateWelcomeAvatar(user.displayName || user.email);


   // Clear the file input and preview
   avatarFileInput.value = ''; 
   selectedAvatarFile = null;
   avatarPreview.src = '';
   avatarPreview.style.display = 'none';
   avatarPlaceholder.style.display = 'block';


  } else {
   console.error('Image upload failed:', data);
   avatarUploadStatus.textContent = `Upload failed: ${data.error ? data.error.message : 'Unknown error'}`;
   avatarUploadStatus.style.color = 'red';
  }
  } catch (error) {
  console.error('Network or API error during upload:', error);
  avatarUploadStatus.textContent = `Error during upload: ${error.message}`;
  avatarUploadStatus.style.color = 'red';
  }
 });


 // =================== End Avatar Upload Logic ====================




 // =================== auth state (MODIFIED FOR DEBUG) ====================
onAuthStateChanged(auth, (user) => {
 // Find the status div - make sure this div exists in your HTML!
 const statusDiv = document.getElementById('status');


 if (user) { // If someone is logged in...
 const name = user.displayName || user.email || 'User';
 document.getElementById('welcome-message').innerText = `Welcome, ${name}!`;
 document.getElementById('user-name').innerText = name;
 updateWelcomeAvatar(name);
 showSection('main-content');


 // Log login event (you can remove this push logging later if you only want successful logins)
 push(ref(database, 'logins'), {
 email: user.email,
 displayName: user.displayName || '',
 timestamp: Date.now()
 });
 // Save last login time
 lastLoginTimestamp = Date.now();


 // Reference to the admin signup notifications div and clear button
 const adminNotificationsDiv = document.getElementById('admin-signup-notifications');
 const clearSignupsButton = document.getElementById('clear-signups'); // Get the clear button


 // Admin check - This is the crucial part
 // Make sure ADMIN_EMAIL is defined somewhere before this function!
 if (user.email?.toLowerCase() === ADMIN_EMAIL) {
  // hi


  // Make sure the admin sections exist in your HTML before trying to remove the class!
  if (adminNotificationsDiv) adminNotificationsDiv.classList.remove('hidden'); // <<< This line makes the box visible
  if (clearSignupsButton) clearSignupsButton.classList.remove('hidden');


  listenForSignups(); // Start the listener (make sure this function is defined!)


 } else {
  // --- TEMPORARY DEBUG: Status if admin check fails ---
  if (statusDiv) { // Check if statusDiv exists before writing
   statusDiv.innerText = `Admin check FAILED for: ${user.email || 'N/A'}`;
  }
  console.log(`Logged in email "${user.email}" does NOT match admin email "${ADMIN_EMAIL}".`); // This will show in browser console if you check later
  // ----------------------------------------------------


  // Ensure the admin sections are hidden if not admin
  if (adminNotificationsDiv) adminNotificationsDiv.classList.add('hidden');
  if (clearSignupsButton) clearSignupsButton.classList.add('hidden');
 }


 } else { // If nobody is logged in (logged out)...
 showSection('welcome-screen');


 // Ensure admin sections are hidden on logout
 const adminNotificationsDiv = document.getElementById('admin-signup-notifications');
 const clearSignupsButton = document.getElementById('clear-signups');
 if (adminNotificationsDiv) adminNotificationsDiv.classList.add('hidden');
 if (clearSignupsButton) clearSignupsButton.classList.add('hidden');


  if (statusDiv) { // Check if statusDiv exists before writing
  statusDiv.innerText = ''; // Clear the status paper
  }
 }
});
// =================== END auth state (MODIFIED FOR DEBUG) ====================




 // =================== Name update handler ====================
 const attachUpdateName = () => {
 const btn = document.getElementById('update-name');
 if (!btn) return;
 btn.replaceWith(btn.cloneNode(true));
 const newBtn = document.getElementById('update-name');
 newBtn.addEventListener('click', () => {
  const user = auth.currentUser;
  if (!user) return;
  const newName = prompt("Enter your new name:");
  if (newName && newName.trim() !== "") {
  updateProfile(user, { displayName: newName.trim() }).then(() => {
  document.getElementById('welcome-message').innerText = `Welcome, ${newName.trim()}!`;
  document.getElementById('user-name').innerText = newName.trim();
  updateWelcomeAvatar(newName.trim());
  alert("Name updated");
  }).catch(e => alert("Error updating name: " + e.message));
  }
 });
 };
 attachUpdateName();


 // Password toggle
 document.querySelectorAll('.password-container').forEach(container => {
 const input = container.querySelector('input');
 const toggleBtn = container.querySelector('.toggle-password');
 toggleBtn.addEventListener('click', () => {
  if (input.type === 'password') {
  input.type = 'text';
  toggleBtn.innerText = 'ðŸ‘';
  } else {
  input.type = 'password';
  toggleBtn.innerText = '(Ã¸)';
  }
 });
 });


 // Forgot Password
 document.getElementById('forgot-password').onclick = () => {
 const email = document.getElementById('login-email').value.trim().toLowerCase();
 if (!email) {
  alert("Please enter your email to reset password.");
  return;
 }
 sendPasswordResetEmail(auth, email).then(() => {
  alert("Password reset email sent. Check your inbox.");
 }).catch(e => {
  alert("Error sending reset email: " + e.message);
 });
 };


  // Cancel edit buttons
 const cancelBtn = document.getElementById('cancel-edit');
 const cancelBtn2 = document.getElementById('cancel-edit2');
 if (cancelBtn) {
 cancelBtn.addEventListener('click', () => {
  editingMessageId = null;
  document.getElementById('message-input').value = '';
  cancelBtn.classList.add('hidden');
  // <<<< NEW CODE ADDED HERE >>>>
  sendTypingStatus('messages', false); // Stop typing when cancel edit is pressed for Chat 1
 });
 }
 if (cancelBtn2) {
 cancelBtn2.addEventListener('click', () => {
  editingMessageId = null;
  document.getElementById('message-input2').value = '';
  cancelBtn2.classList.add('hidden');
  // <<<< NEW CODE ADDED HERE >>>>
  sendTypingStatus('messages_v2', false); // Stop typing when cancel edit is pressed for Chat 2
 });
 }
 // ... (your existing code for cancel edit buttons, after you added the sendTypingStatus calls) ...


 // <<<< NEW CODE STARTS HERE >>>>
 // --- Typing Indicator Input Listeners ---
 const messageInput1 = document.getElementById('message-input');
 const messageInput2 = document.getElementById('message-input2');


 // Listener for Chat 1 (Open Calls)
 if (messageInput1) {
  messageInput1.addEventListener('input', () => {
  // Send typing status as true when the user types in Chat 1
  sendTypingStatus('messages', true);
  });
 }


 // Listener for Chat 2.0
 if (messageInput2) {
  messageInput2.addEventListener('input', () => {
  // Send typing status as true when the user types in Chat 2
  sendTypingStatus('messages_v2', true);
  });
 }
 // --- Typing Indicator Input Listeners (END) ---
 // <<<< NEW CODE ENDS HERE >>>>
 
 if (cancelBtn2) {
 cancelBtn2.addEventListener('click', () => {
  editingMessageId = null;
  document.getElementById('message-input2').value = '';
  cancelBtn2.classList.add('hidden');
  sendTypingStatus('messages_v2', false); // <--- ADD THIS LINE HERE
 });
 }




 // Show login history
 document.getElementById('show-logins').onclick = () => {
 const historyDiv = document.getElementById('login-history');
 const currentUser = auth.currentUser;
 const userEmail = currentUser ? currentUser.email?.toLowerCase() : '';


 const isAdmin = currentUser && userEmail === 'flatbushpatrol101@gmail.com';


 // clear previous
 historyDiv.innerHTML = '';


 const logRef = ref(database, 'logins');


 onValue(logRef, (snap) => {
  const data = snap.val() || {};
  const entries = Object.entries(data);
  // sort by timestamp descending
  entries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));


  if (isAdmin) {
  if (entries.length === 0) {
  historyDiv.innerHTML = 'No login records.';
  return;
  }
  historyDiv.innerHTML = '';
  entries.forEach(([id, login]) => {
  const date = new Date(login.timestamp);
  const formattedDate = date.toLocaleString();
  const displayName = login.displayName || login.email || 'Unknown';
  const entryDiv = document.createElement('div');
  entryDiv.style.padding = '4px 0';
  entryDiv.innerText = `${displayName} - ${formattedDate}`;
  historyDiv.appendChild(entryDiv);
  });
  } else {
  if (entries.length === 0) {
  historyDiv.innerHTML = 'No login records.';
  return;
  }
  historyDiv.innerHTML = '';
  entries.forEach(([id, login]) => {
  const displayName = login.displayName || login.email || 'Unknown';
  const entryDiv = document.createElement('div');
  entryDiv.style.padding = '4px 0';
  entryDiv.innerText = displayName;
  historyDiv.appendChild(entryDiv);
  });
  }
 });
 };


 // Load last login time from localStorage
 lastLoginTimestamp = parseInt(localStorage.getItem('lastLogin') || '0', 10);


 // Utility to update avatar on top of welcome message
function updateWelcomeAvatar(name) {
 const avatarDiv = document.getElementById('welcome-avatar');
 const user = auth.currentUser; // <--- NEW: Get the current authenticated user


 // Check if the user has a photoURL from Firebase Auth
 if (user && user.photoURL) { // <--- NEW: Conditional logic
 avatarDiv.style.backgroundImage = `url('${user.photoURL}')`; // <--- NEW: Use background-image for circular div
 avatarDiv.style.backgroundSize = 'cover'; // <--- NEW
 avatarDiv.style.backgroundPosition = 'center'; // <--- NEW
 avatarDiv.innerText = ''; // <--- NEW: Clear initials if image is present
 
 // --- NEW: Update the settings preview image too ---
 const avatarPreview = document.getElementById('avatar-preview');
 const avatarPlaceholder = document.getElementById('avatar-placeholder');
 if (avatarPreview && avatarPlaceholder) {
  avatarPreview.src = user.photoURL;
  avatarPreview.style.display = 'block';
  avatarPlaceholder.style.display = 'none';
 }
 // --- END NEW ---


 } else {
 // Fallback to initials if no photoURL
 avatarDiv.innerText = getInitials(name);
 avatarDiv.style.backgroundColor = getColorFromName(name);
 avatarDiv.style.backgroundImage = 'none'; // <--- NEW: Remove background image if reverting to initials
 
 // --- NEW: Update the settings preview if no avatar is set ---
 const avatarPreview = document.getElementById('avatar-preview');
 const avatarPlaceholder = document.getElementById('avatar-placeholder');
 if (avatarPreview && avatarPlaceholder) {
  avatarPreview.src = '';
  avatarPreview.style.display = 'none';
  avatarPlaceholder.style.display = 'block';
 }
 // --- END NEW ---
 }


 // Remove previous event listeners by cloning (KEEP THIS AS IS)
 avatarDiv.replaceWith(avatarDiv.cloneNode(true));
 const newAvatarDiv = document.getElementById('welcome-avatar');


 // Attach click event to toggle message box (KEEP THIS AS IS)
 newAvatarDiv.addEventListener('click', () => {
 const box = document.getElementById('new-messages-box');
 if (box.classList.contains('hidden')) {
 box.classList.remove('hidden');
 loadNewMessages();
 } else {
 box.classList.add('hidden');
 }
 });
}


 // load latest messages into the box
function loadNewMessages() {
 const box = document.getElementById('new-messages-box');
 box.innerHTML = '';


 const refMessages = ref(database, 'messages');


 onValue(refMessages, (snap) => {
 const msgs = snap.val() || {};
 // Convert to array & sort by timestamp descending
 const messagesArray = Object.entries(msgs).map(([id, msg]) => ({ id, ...msg }));
 messagesArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));


 // Show only latest 5 messages
 const latestMessages = messagesArray.slice(0, 5);


 latestMessages.forEach(msg => {
 const senderName = msg.sender || 'User';
 const text = msg.text || '';
 const timestamp = msg.timestamp || 0;
 const now = Date.now();
 const timeAgo = getTimeAgo(timestamp, now);


 const messageDiv = document.createElement('div');
 messageDiv.style.marginBottom = '8px';


 messageDiv.innerHTML = `
  <strong>${senderName}</strong> (${timeAgo} ago):<br/>
  ${text}
 `;
 box.appendChild(messageDiv);
 });
 });
}


// Helper to get "X minutes ago"
function getTimeAgo(time, now) {
 if (!time) return '';
 const diff = now - time;
 const seconds = Math.floor(diff / 1000);
 if (seconds < 60) return `${seconds} sec`;
 const minutes = Math.floor(seconds / 60);
 if (minutes < 60) return `${minutes} min`;
 const hours = Math.floor(minutes / 60);
 if (hours < 24) return `${hours} hr`;
 const days = Math.floor(hours / 24);
 return `${days} day`;
}// !! START NEW TYPING INDICATOR FUNCTIONS !!


// Variable to store the typing timeout, so we can clear it if the user types again
let typingTimeout;


/**
 * Sends the current user's typing status to Firebase.
 * @param {string} chatId - The ID of the chat (e.g., 'messages' or 'messages_v2').
 * @param {boolean} isTyping - True if the user is typing, false otherwise.
 */
function sendTypingStatus(chatId, isTyping) {
 const user = auth.currentUser;
 if (!user) return; // Can't send status if no user is logged in


 const typingRef = ref(database, `typing_status/${chatId}/${user.uid}`);


 if (isTyping) {
 // Set user's typing status in Firebase with their display name and a timestamp
 set(typingRef, {
 displayName: user.displayName || user.email,
 timestamp: serverTimestamp() // Use serverTimestamp for accuracy across clients
 });


 // Clear any existing timeout for this user/chat combo
 clearTimeout(typingTimeout);
 // Set a new timeout to remove typing status after a brief pause (e.g., 2 seconds)
 // This is crucial: if the user stops typing, their status should disappear
 typingTimeout = setTimeout(() => {
 remove(typingRef); // Remove the typing status from Firebase
 }, 2000); // Remove after 2 seconds of inactivity (no new 'input' events)
 } else {
 // If stopping explicitly (e.g., sending a message), remove immediately
 remove(typingRef);
 clearTimeout(typingTimeout); // Also clear the timeout to prevent it from firing later
 }
}


/**
 * Listens for typing status from other users in a specific chat and updates the UI.
 * @param {string} chatId - The ID of the chat to listen to (e.g., 'messages' or 'messages_v2').
 * @param {string} typingIndicatorDivId - The ID of the HTML div element to update.
 */
function listenForTypingStatus(chatId, typingIndicatorDivId) {
 const user = auth.currentUser;
 if (!user) return; // Can't listen if no user is logged in


 const typingIndicatorDiv = document.getElementById(typingIndicatorDivId);
 if (!typingIndicatorDiv) {
 console.warn(`Typing indicator div not found: ${typingIndicatorDivId}`);
 return;
 }
 const typingStatusText = typingIndicatorDiv.querySelector('span'); // Get the span element to update its text
 const typingRef = ref(database, `typing_status/${chatId}`);


 // This `onValue` listener will update in real-time whenever there's a change
 // in the 'typing_status' node for the given chat ID.
 onValue(typingRef, (snapshot) => {
 const typingUsers = snapshot.val() || {}; // Get all typing users for this chat
 let otherTypingUsers = [];
 const now = Date.now();
 const TYPING_TIMEOUT_THRESHOLD = 3000; // Consider a user as not typing if their last update was >3 seconds ago


 // Iterate through all users currently reporting a typing status
 for (const uid in typingUsers) {
 // 1. Exclude the current logged-in user themselves
 // 2. Only include users whose last typing action was very recent (to avoid stale indicators)
 if (uid !== user.uid && (now - (typingUsers[uid].timestamp || 0)) < TYPING_TIMEOUT_THRESHOLD) {
  otherTypingUsers.push(typingUsers[uid].displayName);
 }
 }


 if (otherTypingUsers.length > 0) {
 // If there are other users currently typing, show the indicator
 typingIndicatorDiv.classList.remove('hidden');
 if (otherTypingUsers.length === 1) {
  typingStatusText.innerText = `${otherTypingUsers[0]} is typing...`;
 } else {
  // If multiple users are typing, list their names
  typingStatusText.innerText = `${otherTypingUsers.join(', ')} are typing...`;
 }
 } else {
 // If no other users are typing, hide the indicator
 typingIndicatorDiv.classList.add('hidden');
 }
 });
}


// !! END NEW TYPING INDICATOR FUNCTIONS !!


// !! ADD THIS NEW FUNCTION BELOW !!
// =================== Function to listen for Admin Signup Notifications ====================
// This function is called only when an admin user logs in
function listenForSignups() {
 const signupListUl = document.getElementById('signup-list');
 const adminNotificationsDiv = document.getElementById('admin-signup-notifications');
 const clearButton = document.getElementById('clear-signups'); // Get the clear button


 // Ensure the admin section is visible for admin
 adminNotificationsDiv.classList.remove('hidden');
 clearButton.classList.remove('hidden');


 // Listen for changes in the 'signups' node
 // onValue will trigger initially with existing data and then for every change
 onValue(ref(database, 'signups'), (snapshot) => {
  const signups = snapshot.val() || {};
  signupListUl.innerHTML = ''; // Clear the current list before displaying


  const signupEntries = Object.entries(signups);


  if (signupEntries.length > 0) {
  // Sort by timestamp descending so newest signups appear at the top
  signupEntries.sort((a, b) => (b[1].timestamp || 0) - (a[1].timestamp || 0));


  signupEntries.forEach(([id, signup]) => {
   const listItem = document.createElement('li');
   const signupTime = signup.timestamp || Date.now(); // Use current time if timestamp is missing
   // Ensure you have the getTimeAgo helper function defined elsewhere in your script
   const timeAgo = getTimeAgo(signupTime, Date.now());


   listItem.style.marginBottom = '8px';
   listItem.style.paddingBottom = '8px';
   listItem.style.borderBottom = '1px solid rgba(255,255,255,0.1)'; // Subtle separator
   listItem.style.wordBreak = 'break-word'; // Prevent long emails from overflowing


   listItem.innerHTML = `
    <strong>New User:</strong> ${signup.name || 'N/A'} <br>
    <strong>Email:</strong> ${signup.email || 'N/A'} <br>
    <span style="font-size:0.9em; opacity:0.8;">Signed up ${timeAgo} ago</span>
   `;
   signupListUl.appendChild(listItem);
  });
   // Scroll to the top of the list when new signups appear/load
   // Use a small timeout to allow the DOM updates to render
   setTimeout(() => {
   adminNotificationsDiv.scrollTop = 0;
   }, 50);




  } else {
   // If there are no signups, you might want to indicate it
   signupListUl.innerHTML = '<li style="opacity: 0.8;">No new signups.</li>'; // Indicate empty list
   // You could also add back: adminNotificationsDiv.classList.add('hidden'); to hide it entirely when empty
  }
 }, (error) => {
  // Error handling for the listener (e.g., permission denied)
  console.error("Error listening for signups:", error);
  if (error.message.includes('permission_denied')) {
   console.warn("Permission denied for signups node. This is expected for non-admins.");
   // Hide admin specific elements if permission is denied
   document.getElementById('admin-signup-notifications').classList.add('hidden');
   document.getElementById('clear-signups').classList.add('hidden');
  } else {
   // Handle other potential database errors
   signupListUl.innerHTML = `<li>Error loading signups: ${error.message}</li>`;
  }
 });
}
// =================== END listenForSignups FUNCTION ====================
// =================== DIRECT MESSAGE FUNCTIONS ===================


// Function to fetch and display users for new DM
async function loadDmUsers() {
 // ... (rest of loadDmUsers function code) ...
}


// Function to start a DM conversation
function startDmConversation(recipientUid, recipientName) {
 // ... (rest of startDmConversation function code) ...
}


// Function to send a direct message
async function sendDirectMessage() {
 // ... (rest of sendDirectMessage function code) ...
}


// =================== END DIRECT MESSAGE FUNCTIONS ===================
// Add this event handler:
document.getElementById('clear-signups').addEventListener('click', () => {
 if (confirm('Are you sure you want to clear all signup notifications?')) {
 remove(ref(database, 'signups')).then(() => {
 alert('Signup notifications cleared.');
 }).catch(e => {
 console.error('Error clearing signups:', e);
 alert('Error clearing signups: ' + e.message);
 });
 }
});


 // =================== Icon click handlers ====================
 // Show Settings screen when icon clicked
 document.getElementById('settings-icon').addEventListener('click', () => {
 document.querySelectorAll('.container').forEach(c => c.classList.add('hidden'));
 document.getElementById('settings-screen').classList.remove('hidden');
 });
 // Back button in Settings
 document.getElementById('back-from-settings').addEventListener('click', () => {
 showSection('main-content'); // or previous screen
 });
 // Add button in Settings
 document.getElementById('add-button').addEventListener('click', () => {
 alert('Add button clicked!');
 });


 });
// Show/Hide Modals
document.getElementById('report-incident-btn').onclick = () => {
 document.getElementById('incident-modal').classList.remove('hidden');
 setTimeout(initIncidentMap, 100); // To ensure modal is visible
};
document.getElementById('close-incident-modal').onclick = () => {
 document.getElementById('incident-modal').classList.add('hidden');
};

// Incident Map
let incidentLatLng = null;
function initIncidentMap() {
 const map = L.map('incident-map').setView([40.65, -73.95], 13); // Default to Flatbush
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
 let marker = null;
 map.on('click', function(e) {
 incidentLatLng = e.latlng;
 if (marker) map.removeLayer(marker);
 marker = L.marker(e.latlng).addTo(map);
 });
}


    // Submit Incident
document.getElementById('submit-incident').onclick = async function() {
 const desc = document.getElementById('incident-desc').value.trim();
 if (!desc || !incidentLatLng) {
 alert("Please provide a description and location");
 return;
 }

 // Get address from coordinates
 const address = await getAddressFromLatLng(incidentLatLng.lat, incidentLatLng.lng);

 // Save to Firebase (add a 'location' and 'address' field)
 const user = auth.currentUser;
 push(ref(database, 'messages'), {
 text: desc,
 location: { lat: incidentLatLng.lat, lng: incidentLatLng.lng },
 address: address,
 timestamp: serverTimestamp(),
 sender: user ? (user.displayName || user.email || 'Anonymous') : 'Anonymous'
 });
 document.getElementById('incident-modal').classList.add('hidden');
 document.getElementById('incident-desc').value = '';
 incidentLatLng = null;
 alert("Incident reported successfully!");
};

// Render Map in Chat Messages
function renderMessage(msg) {
 const container = document.createElement('div');
 container.innerText = msg.text;
 if (msg.location) {
 const mapDiv = document.createElement('div');
 mapDiv.style.width = '120px';
 mapDiv.style.height = '80px';
 mapDiv.style.cursor = 'pointer';
 mapDiv.className = 'mini-map';
 container.appendChild(mapDiv);
 // Initialize small map after element is in DOM
 setTimeout(() => {
 const map = L.map(mapDiv, { attributionControl: false, zoomControl: false, dragging: false, scrollWheelZoom: false }).setView([msg.location.lat, msg.location.lng], 15);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
 L.marker([msg.location.lat, msg.location.lng]).addTo(map);
 mapDiv.onclick = () => showBigMap(msg.location);
 }, 100);
 }
 return container;
}

// Function to get address from coordinates
async function getAddressFromLatLng(lat, lng) {
 try {
 const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
 const data = await response.json();
 return data.display_name || 'Address not found';
 } catch (error) {
 console.error('Error fetching address:', error);
 return 'Address lookup failed';
 }
}

// Show big map modal
function showBigMap(location) {
 document.getElementById('big-map-modal').classList.remove('hidden');
 setTimeout(() => {
 const map = L.map('big-incident-map').setView([location.lat, location.lng], 17);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
 L.marker([location.lat, location.lng]).addTo(map);
 }, 100);
}
document.getElementById('close-big-map-modal').onclick = function() {
 document.getElementById('big-map-modal').classList.add('hidden');
 document.getElementById('big-incident-map').innerHTML = '';
};

// NFC Implementation
function setupNfc() {
 const loginNfcButton = document.getElementById('login-with-nfc-button');
 const loginNfcStatus = document.getElementById('login-nfc-status');
 const enrollNfcButton = document.getElementById('enroll-nfc-button');
 const nfcStatus = document.getElementById('nfc-status');

 // Check if Web NFC API is available
 const isDesktop = window.innerWidth > 900;
 if (!('NDEFReader' in window)) {
  loginNfcStatus.textContent = 'Web NFC not supported in this browser';
  nfcStatus.textContent = 'Web NFC not supported in this browser';
  loginNfcButton.disabled = true;
  enrollNfcButton.disabled = true;
  // On desktop, hide the buttons or show a tooltip
  if (isDesktop) {
  loginNfcButton.style.display = 'none';
  enrollNfcButton.style.display = 'none';
  } else {
  loginNfcButton.title = 'NFC only available on supported mobile devices';
  enrollNfcButton.title = 'NFC only available on supported mobile devices';
  }
  return;
 }

 // Login with NFC functionality
 loginNfcButton.addEventListener('click', async () => {
  try {
  loginNfcStatus.textContent = 'Hold your NFC tag near the device...';
  const ndef = new NDEFReader();
  await ndef.scan();
  
   ndef.addEventListener('reading', ({ message }) => {
    try {
     for (const record of message.records) {
      if (record.recordType === 'text') {
       const textDecoder = new TextDecoder(record.encoding);
       const uid = textDecoder.decode(record.data);
       loginNfcStatus.textContent = `Read UID: ${uid}`;

       // Attempt to sign in with the UID
       signInWithCustomToken(auth, uid)
        .then((userCredential) => {
         loginNfcStatus.textContent = 'Login successful!';
         console.log('Signed in with NFC:', userCredential.user);
        })
        .catch((error) => {
         loginNfcStatus.textContent = `Login failed: ${error.message}`;
         console.error('NFC login error:', error);
        });
      }
     }
    } catch (error) {
     loginNfcStatus.textContent = `Error processing NFC message: ${error}`;
     console.error('NFC reading error', error);
    }
   });
  } catch (error) {
   loginNfcStatus.textContent = `Error: ${error}`;
   console.error('NFC scan error', error);
  }
 });

 // Enroll NFC tag functionality
 enrollNfcButton.addEventListener('click', async () => {
  try {
   nfcStatus.textContent = 'Hold a blank NFC tag near the device...';
   const ndef = new NDEFReader();
   
   // Get current user's UID
   const user = auth.currentUser;
   if (!user) {
    nfcStatus.textContent = 'Please log in first to enroll NFC tag';
    return;
   }
   
   // Write the user's UID to the NFC tag
   await ndef.write({
    records: [{
     recordType: 'text',
     data: user.uid
    }]
   });
   
   nfcStatus.textContent = 'NFC tag enrolled successfully!';
   console.log('NFC tag enrolled for user:', user.uid);
   
  } catch (error) {
   nfcStatus.textContent = `Enrollment failed: ${error.message}`;
   console.error('NFC enrollment error:', error);
  }
 });
}

// Initialize NFC functionality when page loads
document.addEventListener('DOMContentLoaded', () => {
 setupNfc();
});
