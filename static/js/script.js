let selectedJournal = "";
let chatHistory = [];
let isListening = false;
let recognitionActive = false;
let speechRecognition = null;
let speechSynthesis = window.speechSynthesis;
let voiceMode = false;
let currentlySpeaking = false;
let lastAIMessage = null;
let journalTranscript = '';
let isJournaling = false;
let lastPauseTime = null;
const PAUSE_THRESHOLD = 2000; // 2 seconds pause suggests new paragraph

let ambiencePlayer = null;

// Initialize speech recognition
function initSpeechRecognition() {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onstart = function() {
            recognitionActive = true;
            updateVoiceFeedback("Listening...");
            document.getElementById("voiceButton").classList.add("listening");
        };

        speechRecognition.onend = function() {
            recognitionActive = false;
            if (isListening) {
                // Restart if we're still in listening mode but recognition ended
                speechRecognition.start();
            } else {
                updateVoiceFeedback("Click the microphone to start speaking");
                document.getElementById("voiceButton").classList.remove("listening");
            }
        };

        let finalTranscript = '';
        
        speechRecognition.onresult = function(event) {
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }
            
            if (interimTranscript) {
                updateVoiceFeedback(interimTranscript);
            }
            
            if (finalTranscript) {
                updateVoiceFeedback("Processing: " + finalTranscript);
                
                // Stop listening when we have a final result
                stopListening();
                
                // Process the voice input
                if (finalTranscript.trim()) {
                    submitVoiceInput(finalTranscript.trim());
                    finalTranscript = '';
                }
            }
        };

        speechRecognition.onerror = function(event) {
            console.error("Speech recognition error:", event.error);
            updateVoiceFeedback("Error: " + event.error);
            isListening = false;
            document.getElementById("voiceButton").classList.remove("listening");
        };
        
        return true;
    } else {
        console.error("Speech recognition not supported in this browser");
        updateVoiceFeedback("Speech recognition not supported in this browser");
        return false;
    }
}

function startListening() {
    if (!speechRecognition) {
        const initialized = initSpeechRecognition();
        if (!initialized) return;
    }
    
    try {
        isListening = true;
        speechRecognition.start();
    } catch (error) {
        console.error("Error starting speech recognition:", error);
    }
}

function stopListening() {
    isListening = false;
    if (speechRecognition && recognitionActive) {
        try {
            speechRecognition.stop();
        } catch (error) {
            console.error("Error stopping speech recognition:", error);
        }
    }
}

function toggleVoiceMode() {
    // Change to use the checked state directly instead of reversing it
    voiceMode = document.getElementById("voiceToggle").checked;
    const textInputContainer = document.getElementById("textInputContainer");
    const voiceInputContainer = document.getElementById("voiceInputContainer");
    
    if (voiceMode) {
        textInputContainer.style.display = "none";
        voiceInputContainer.style.display = "flex";
        
        // Initialize speech recognition if needed
        if (!speechRecognition) {
            initSpeechRecognition();
        }
    } else {
        textInputContainer.style.display = "flex";
        voiceInputContainer.style.display = "none";
        
        // Stop listening if active
        stopListening();
        
        // Stop speaking if active
        if (currentlySpeaking) {
            stopSpeaking();
        }
    }
}

function updateVoiceFeedback(text) {
    const feedback = document.getElementById("voiceFeedback");
    feedback.textContent = text;
}

function submitVoiceInput(text) {
    addMessage(text, true);
    processUserInput(text);
}

function speakText(text) {
    if (!voiceMode) return;
    
    // First, stop any ongoing speech
    stopSpeaking();
    
    // Clean the text - remove HTML tags
    const cleanText = text.replace(/<[^>]*>?/gm, '');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Set voice preferences
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
        voice.name.includes("Female") || 
        voice.name.includes("Google") || 
        voice.name.includes("Natural")
    );
    
    if (preferredVoice) {
        utterance.voice = preferredVoice;
    }
    
    // Set other properties for natural sound
    utterance.rate = 1.0;  // Normal speed
    utterance.pitch = 1.0; // Normal pitch
    utterance.volume = 1.0; // Full volume
    
    // Add highlighting to the message being spoken
    if (lastAIMessage) {
        lastAIMessage.classList.add("speaking");
    }
    
    currentlySpeaking = true;
    
    utterance.onend = function() {
        currentlySpeaking = false;
        if (lastAIMessage) {
            lastAIMessage.classList.remove("speaking");
        }
        
        // Automatically start listening after AI finishes speaking
        if (voiceMode) {
            setTimeout(() => {
                startListening();
            }, 500);
        }
    };
    
    speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    if (speechSynthesis && speechSynthesis.speaking) {
        speechSynthesis.cancel();
        currentlySpeaking = false;
        
        if (lastAIMessage) {
            lastAIMessage.classList.remove("speaking");
        }
    }
}

function processUserInput(input) {
    const journalContent = sessionStorage.getItem('journalContent');
    const currentJournal = sessionStorage.getItem('selectedJournal');
    
    // Debug logging
    console.log('Processing input for journal:', currentJournal);
    console.log('Journal content available:', !!journalContent);
    
    if (!currentJournal || !journalContent) {
        const message = "Please select a journal before chatting.";
        addMessage(message, false);
        if (voiceMode) {
            speakText(message);
        }
        return;
    }
    
    if (!input.trim()) {
        const message = "Please enter a question or prompt.";
        addMessage(message, false);
        if (voiceMode) {
            speakText(message);
        }
        return;
    }
    
    // Clear input after validation passes
    const chatInput = document.getElementById("chatInput");
    if (chatInput) {
        chatInput.value = "";
    }
    
    const chatMessages = document.getElementById("chatMessages");
    const loadingDiv = document.createElement("div");
    loadingDiv.className = "message ai";
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMessages.appendChild(loadingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            journal: journalContent,  // Use the journal content from session storage
            prompt: input 
        })
    }).then(response => response.json())
        .then(data => {
            chatMessages.removeChild(loadingDiv);
            
            // Store a reference to this response content div
            const messageDiv = addMessage(data.response, false);
            lastAIMessage = messageDiv;
            
            // If in voice mode, speak the response
            if (voiceMode) {
                speakText(data.response);
            }
        })
        .catch(error => {
            console.error("Error chatting with AI:", error);
            chatMessages.removeChild(loadingDiv);
            
            const errorMessage = `<p style="color: #e74c3c;">⚠️ An error occurred while processing your request. Please try again.</p>`;
            addMessage(errorMessage, false);
            
            if (voiceMode) {
                speakText("An error occurred while processing your request. Please try again.");
            }
        });
}

function showNotification(message) {
    let notification = document.getElementById('notification');
    
    // Create notification element if it doesn't exist
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.className = 'notification';
        document.body.appendChild(notification);
    }
    
    // Clear any existing timeout
    if (notification.timeout) {
        clearTimeout(notification.timeout);
        notification.classList.remove('show');
    }
    
    // Set new message and show
    notification.textContent = message;
    
    // Use setTimeout to ensure the remove/add of 'show' class works
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Store timeout reference and hide after delay
    notification.timeout = setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

function formatTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // Convert 0 to 12
    return `${hours}:${minutes} ${ampm}`;
}

function saveJournal(isAutoSave = false) {
    const entry = document.getElementById("journalEntry").value;
    const filename = document.getElementById("filename").value;
    
    if (!entry.trim() || !filename.trim()) {
        if (!isAutoSave) showNotification("Please enter both content and filename.");
        return;
    }
    
    fetch("/save_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry, filename })
    })
    .then(response => response.json())
    .then(data => {
        if (isAutoSave) {
            const timeStr = formatTime();
            showNotification("Journal auto-saved");
            const status = document.getElementById('autoSaveStatus');
            if (status) {
                status.textContent = `Last auto-saved: ${timeStr}`;
                status.style.display = 'inline';
            }
        } else {
            showNotification(data.message);
        }
    })
    .catch(error => {
        if (!isAutoSave) showNotification("Error saving: " + error);
        console.error("Save error:", error);
    });
}

function saveJournalWithDetails(isAutoSave = false, callback = null) {
    const entry = document.getElementById('journalEntry').innerHTML;
    const title = document.getElementById('journalTitle').value.trim();
    const date = document.getElementById('journalDate').value.trim();
    
    // Validate required fields
    if (!title) {
        alert("Please enter a title for your journal entry.");
        return;
    }
    if (!date) {
        alert("Please select a date for your journal entry.");
        return;
    }

    // Close save modal and show write modal immediately
    closeSaveModal();
    document.getElementById('writeModal').classList.add('active');
    
    // Create the filename and prepare data
    const filename = `${date}_${title}.txt`;
    const journalData = {
        entry: entry || ' ',  // Send empty space if no content yet
        title: title,
        date: date,
        filename: filename
    };
    
    // Send to backend
    fetch("/save_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(journalData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            lastContent = entry;
            showNotification("Journal created successfully!");
            document.getElementById('journalTitle').dataset.originalFile = filename;
            if (callback) callback();
        }
    })
    .catch(error => {
        console.error("Save error:", error);
        showNotification("Error saving journal. Don't worry, you can continue writing.");
    });
}

function listJournals() {
    fetch("/list_journals")
        .then(response => response.json())
        .then(data => {
            const list = document.getElementById("journalList");
            list.innerHTML = "";
            if (data.journals.length === 0) {
                const item = document.createElement("li");
                item.textContent = "No journals found. Create one!";
                item.style.cursor = "default";
                list.appendChild(item);
                return;
            }
            
            data.journals.forEach(file => {
                const item = document.createElement("li");
                const journalContainer = document.createElement("div");
                journalContainer.className = "journal-item";
                
                // Extract just the title part by removing date prefix and .txt extension
                const nameSpan = document.createElement("span");
                const title = file.split('_').slice(1).join('_').replace('.txt', '');
                nameSpan.textContent = title;
                nameSpan.onclick = () => selectJournal(file, item);
                
                const actionsContainer = document.createElement("div");
                actionsContainer.className = "journal-actions";
                
                const actionsBtn = document.createElement("button");
                actionsBtn.className = "actions-btn";
                actionsBtn.innerHTML = '<i class="fas fa-ellipsis-v"></i>';
                actionsBtn.onclick = (e) => {
                    e.stopPropagation();
                    toggleActionsMenu(actionsContainer);
                };
                
                const actionsDropdown = document.createElement("div");
                actionsDropdown.className = "actions-dropdown";
                actionsDropdown.innerHTML = `
                    <div class="action-item" onclick="editJournal('${file}')">
                        <i class="fas fa-edit"></i>Edit
                    </div>
                    <div class="action-item" onclick="showJournalChat('${file}')">
                        <i class="fas fa-comments"></i>Chat about this entry
                    </div>
                    <div class="action-item delete" onclick="deleteJournal('${file}', this.closest('li'))">
                        <i class="fas fa-trash"></i>Delete
                    </div>
                `;
                
                actionsContainer.appendChild(actionsBtn);
                actionsContainer.appendChild(actionsDropdown);
                journalContainer.appendChild(nameSpan);
                journalContainer.appendChild(actionsContainer);
                item.appendChild(journalContainer);
                
                if (file === selectedJournal) {
                    item.classList.add("selected");
                }
                list.appendChild(item);
            });
        })
        .catch(error => {
            console.error("Error listing journals:", error);
        });
}

function toggleActionsMenu(container) {
    // Close any other open menus first
    document.querySelectorAll('.actions-dropdown.show').forEach(dropdown => {
        if (!container.contains(dropdown)) {
            dropdown.classList.remove('show');
        }
    });
    
    const dropdown = container.querySelector('.actions-dropdown');
    dropdown.classList.toggle('show');
    
    // Close menu when clicking outside
    const closeMenu = (e) => {
        if (!container.contains(e.target)) {
            dropdown.classList.remove('show');
            document.removeEventListener('click', closeMenu);
        }
    };
    
    document.addEventListener('click', closeMenu);
}

function showJournalChat(filename) {
    // First load the journal content
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    })
    .then(response => response.json())
    .then(data => {
        // Create and show the chat modal
        const modalHtml = `
            <div class="journal-chat-modal" id="journalChatModal">
                <div class="journal-chat-content">
                    <div class="chat-header">
                        <span class="chat-title">Chat about: ${filename}</span>
                        <button class="close-modal" onclick="closeJournalChat()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="chatMessages" class="chat-messages">
                        <div class="message ai">
                            <div class="message-content">
                                What would you like to know about this journal entry?
                            </div>
                        </div>
                    </div>
                    <div class="chat-input-container">
                        <textarea id="chatInput" placeholder="Ask about this journal entry..."></textarea>
                        <button onclick="sendJournalChat('${filename}')">Send</button>
                    </div>
                </div>
            </div>
        `;
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Store journal content in session storage for this chat session
        sessionStorage.setItem('currentChatJournal', filename);
        sessionStorage.setItem('currentChatContent', data.entry);
        
        // Show modal
        setTimeout(() => {
            document.getElementById('journalChatModal').classList.add('active');
            document.getElementById('chatInput').focus();
        }, 10);
    });
}

function closeJournalChat() {
    const modal = document.getElementById('journalChatModal');
    modal.classList.remove('active');
    setTimeout(() => modal.remove(), 300);
    
    // Clear chat session storage
    sessionStorage.removeItem('currentChatJournal');
    sessionStorage.removeItem('currentChatContent');
}

function sendJournalChat(filename) {
    const input = document.getElementById('chatInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    // Add user message
    addMessage(content, true);
    input.value = '';
    
    const journalContent = sessionStorage.getItem('currentChatContent');
    
    // Send to AI
    fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            journal: journalContent,
            prompt: content
        })
    })
    .then(response => response.json())
    .then(data => {
        addMessage(data.response, false);
    })
    .catch(error => {
        console.error("Chat error:", error);
        addMessage("Sorry, there was an error processing your request.", false);
    });
}

function deleteJournal(filename, item) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    fetch("/delete_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    }).then(response => response.json())
      .then(data => {
          if (data.message) {
              // Clear selection if deleted journal was selected
              if (filename === selectedJournal) {
                  selectedJournal = "";
                  sessionStorage.removeItem('selectedJournal');
                  sessionStorage.removeItem('journalContent');
                  
                  // Clear preview if it exists
                  const previewContent = document.querySelector('.preview-content');
                  if (previewContent) {
                      previewContent.textContent = "";
                  }
                  
                  // Clear journal entry if on write page
                  const journalEntry = document.getElementById("journalEntry");
                  if (journalEntry) {
                      journalEntry.value = "";
                  }
              }
              
              // Remove the item from the list
              item.remove();
              
              // Refresh the list
              listJournals();
          }
      })
      .catch(error => {
          console.error("Error deleting journal:", error);
          alert("Error deleting journal.");
      });
}

function selectJournal(filename, item) {
    // First ensure preview container is visible
    const previewContainer = document.getElementById('journalPreview');
    const previewContent = document.querySelector('.preview-content');
    
    if (previewContainer && previewContent) {
        previewContainer.style.display = 'block';
        previewContent.textContent = 'Loading journal...';
    }

    // Load journal content
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    })
    .then(response => {
        if (!response.ok) throw new Error('Failed to load journal');
        return response.json();
    })
    .then(data => {
        // Update session storage
        sessionStorage.setItem('selectedJournal', filename);
        sessionStorage.setItem('journalContent', data.entry);
        
        // Update selection state
        document.querySelectorAll("#journalList li").forEach(li => li.classList.remove("selected"));
        item.classList.add("selected");
        selectedJournal = filename;

        // Update preview content
        if (previewContent) {
            // Handle empty content
            if (!data.entry.trim()) {
                previewContent.textContent = 'This journal entry is empty.';
                return;
            }
            
            // Format and display content - Use innerHTML instead of textContent
            previewContent.innerHTML = data.entry;
        }

        // Update journal details if they exist
        const journalDetails = document.getElementById('journalDetails');
        if (journalDetails) {
            journalDetails.classList.remove('hidden');
            updateJournalDetails(filename, data.entry);
        }
    })
    .catch(error => {
        console.error('Error loading journal:', error);
        if (previewContent) {
            previewContent.textContent = "Error loading journal content. Please try again.";
        }
        item.classList.remove("selected");
        sessionStorage.removeItem('selectedJournal');
        sessionStorage.removeItem('journalContent');
    });
}

function updateJournalDetails(filename, content) {
    const detailsPanel = document.getElementById('journalDetails');
    if (!detailsPanel) return;
    
    // Parse filename for date and title
    const [date, ...titleParts] = filename.replace('.txt', '').split('_');
    const title = titleParts.join(' ');
    
    // Calculate word and character count
    const wordCount = content.trim().split(/\s+/).length;
    const charCount = content.length;
    
    // Update the details
    document.getElementById('journalTitle').textContent = title;
    document.getElementById('journalDate').textContent = formatDate(date);
    document.getElementById('journalLength').textContent = 
        `${wordCount} words, ${charCount} characters`;
    
    // Show the panel with animation
    detailsPanel.classList.remove('hidden');
    setTimeout(() => {
        detailsPanel.classList.add('visible');
    }, 10);
}

function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr; // Fallback to original string if parsing fails
    }
}

function loadJournal(filename) {
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    }).then(response => response.json())
      .then(data => {
          document.getElementById("journalEntry").value = data.entry;
      })
      .catch(error => {
          console.error("Error loading journal:", error);
          alert("Error loading journal.");
      });
}

function addMessage(content, isUser) {
    const chatMessages = document.getElementById("chatMessages");
    const messageDiv = document.createElement("div");
    messageDiv.className = isUser ? "message user" : "message ai";
    
    const messageContent = document.createElement("div");
    messageContent.className = "message-content";
    messageContent.innerHTML = isUser ? content : parseAndFormatResponse(content);
    
    messageDiv.appendChild(messageContent);
    chatMessages.appendChild(messageDiv);
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Save chat history to localStorage
    localStorage.setItem('chatHistory', chatMessages.innerHTML);
    
    chatHistory.push({
        role: isUser ? "user" : "ai",
        content: content
    });
    
    return messageContent;
}

function chatWithAI() {
    const prompt = document.getElementById("chatInput").value;
    
    // Add the user's input to the chat before processing
    if (prompt.trim()) {
        addMessage(prompt, true);
    }
    
    processUserInput(prompt);
}

function parseAndFormatResponse(text) {
    if (!text) return "<p>No response received.</p>";
    
    if (text.includes("⚠️")) {
        return `<p style="color: #e74c3c; font-weight: bold;">${text}</p>`;
    }
    
    text = text.replace(/^📌 <strong>Here's what I found:<\/strong><br><br><ul>/, '');
    text = text.replace(/<\/ul>$/, '');
    
    const emojiPattern = /• ([^:]+): (\d+)\/100 ([\p{Emoji}\u200d♂️\u200d♀️]+)/ug;
    const hasEmojiFormatting = emojiPattern.test(text);
    
    if (hasEmojiFormatting) {
        let formatted = '';
        
        emojiPattern.lastIndex = 0;
        
        text = text.replace(emojiPattern, function(match, category, value, emoji) {
            return `<div><span style="margin-right: 5px;">${emoji}</span> <strong>${category}:</strong> ${value}/100</div>`;
        });
        
        return text;
    }
    
    return convertMarkdownToHTML(text);
}

function convertMarkdownToHTML(text) {
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(?<!\*)\*([^\*]+)\*(?!\*)/g, "<em>$1</em>");
    text = text.replace(/^# (.*$)/gm, "<h3>$1</h3>");
    text = text.replace(/^## (.*$)/gm, "<h4>$1</h4>");
    
    let hasBulletPoints = /^[•\-*] /m.test(text);
    
    if (hasBulletPoints) {
        let lines = text.split('\n');
        let inList = false;
        let result = '';
        
        for (let line of lines) {
            if (/^[•\-*] /.test(line)) {
                if (!inList) {
                    result += '<ul>';
                    inList = true;
                }
                
                let bulletContent = line.replace(/^[•\-*] /, '');
                result += `<li>${bulletContent}</li>`;
            } else {
                if (inList) {
                    result += '</ul>';
                    inList = false;
                }
                
                if (line.trim()) {
                    result += line + '\n';
                }
            }
        }
        
        if (inList) {
            result += '</ul>';
        }
        
        text = result;
    }
    
    if (!text.includes("<p>") && !text.includes("<div>") && !text.includes("<ul>")) {
        text = `<p>${text}</p>`;
    }
    
    text = text.replace(/<br><br>/g, '</p><p>');
    
    return text;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chatInput');
    const voiceToggle = document.getElementById('voiceToggle');
    const voiceButton = document.getElementById('voiceButton');
    
    // Handle Enter key in text input
    chatInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            chatWithAI();
        }
    });
    
    // Handle toggle switch for voice mode
    voiceToggle.addEventListener('change', function() {
        toggleVoiceMode();
    });
    
    // Handle voice button click
    voiceButton.addEventListener('click', function() {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });
    
    // Load available voices for speech synthesis
    if (speechSynthesis) {
        speechSynthesis.onvoiceschanged = function() {
            // Just to make sure voices are loaded
            speechSynthesis.getVoices();
        };
    }
    
    // Add sidebar toggle functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const content = document.querySelector('.content');
    
    // Load saved state
    const sidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        content.classList.add('expanded');
    }
    
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        content.classList.toggle('expanded');
        
        // Save state
        localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
        
        // Trigger window resize to update any charts or responsive elements
        window.dispatchEvent(new Event('resize'));
    });
    
    // Handle keyboard navigation
    sidebarToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            sidebarToggle.click();
        }
    });

    // Check for stored journal and restore chat state
    const storedJournal = sessionStorage.getItem('selectedJournal');
    if (storedJournal) {
        selectedJournal = storedJournal;
        const journalList = document.getElementById("journalList");
        if (journalList) {
            const items = journalList.getElementsByTagName("li");
            for (let item of items) {
                const nameSpan = item.querySelector('span');
                if (nameSpan && nameSpan.textContent === storedJournal) {
                    item.classList.add("selected");
                    break;
                }
            }
        }
    }
});

window.onload = function() {
    listJournals();
    
    // Check for stored journal on page load
    const storedJournal = sessionStorage.getItem('selectedJournal');
    if (storedJournal) {
        selectedJournal = storedJournal;
        // Update UI to show selected journal
        const journalList = document.getElementById("journalList");
        if (journalList) {
            setTimeout(() => {
                const items = journalList.getElementsByTagName("li");
                for (let item of items) {
                    if (item.textContent === storedJournal) {
                        item.classList.add("selected");
                        break;
                    }
                }
            }, 100); // Small delay to ensure list is populated
        }
    }
    
    // Initialize speech capabilities
    if ('speechSynthesis' in window) {
        // Speech synthesis is supported
        speechSynthesis = window.speechSynthesis;
    } else {
        console.warn("Speech synthesis not supported in this browser");
    }
};

// OCR functionality
function showImageModal() {
    document.getElementById('imageModal').classList.add('active');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('ocrResult').style.display = 'none';
    document.getElementById('ocrLoader').style.display = 'none';
}

// Initialize image upload handling
document.getElementById('imageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
    }

    // Preview image
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('previewImg').src = e.target.result;
        document.getElementById('imagePreview').style.display = 'block';
        document.getElementById('ocrResult').style.display = 'none';
    };
    reader.readAsDataURL(file);
});

async function processImage() {
    const img = document.getElementById('previewImg');
    const loader = document.getElementById('ocrLoader');
    const result = document.getElementById('ocrResult');
    const preview = document.getElementById('ocrPreview');

    try {
        loader.style.display = 'block';
        result.style.display = 'none';
        loader.querySelector('p').textContent = 'Processing image...';

        // Simple OCR without second pass
        const { data: { text } } = await Tesseract.recognize(img.src, 'eng', {
            logger: message => {
                if (message.status === 'recognizing text') {
                    loader.querySelector('p').textContent = 
                        `Processing: ${Math.round(message.progress * 100)}%`;
                }
            }
        });

        // Display the text directly
        preview.textContent = text;
        preview.dataset.ocrText = text;
        
        loader.style.display = 'none';
        result.style.display = 'block';
    } catch (error) {
        console.error('OCR Error:', error);
        loader.style.display = 'none';
        alert('Error processing image. Please try again.');
    }
}

function insertText() {
    const text = document.getElementById('ocrPreview').textContent;
    
    // First close the image modal
    closeImageModal();
    
    // Open the write modal
    showWriteModal();
    
    // Wait a brief moment for the modal to open
    setTimeout(() => {
        const editor = document.getElementById('journalEntry');
        if (editor.isContentEditable) {
            // For contenteditable div
            editor.innerHTML += `<p>${text}</p>`;
        } else {
            // For textarea
            const cursorPos = editor.selectionStart || editor.value.length;
            editor.value = editor.value.slice(0, cursorPos) + 
                          text + 
                          editor.value.slice(editor.selectionEnd);
        }
    }, 100);
}

function startVoiceJournal() {
    if (!speechRecognition) {
        const initialized = initSpeechRecognition();
        if (!initialized) return;
    }
    
    isJournaling = true;
    journalTranscript = '';
    lastPauseTime = null;
    
    try {
        speechRecognition.onresult = handleJournalSpeech;
        speechRecognition.start();
        updateVoiceFeedback("Listening to your journal entry...");
    } catch (error) {
        console.error("Error starting voice journal:", error);
    }
}

function handleJournalSpeech(event) {
    let interimTranscript = '';
    let finalTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        
        if (event.results[i].isFinal) {
            // Simple pause detection for paragraphs
            const currentTime = Date.now();
            if (lastPauseTime && (currentTime - lastPauseTime) > PAUSE_THRESHOLD) {
                finalTranscript = '\n\n' + transcript;
            } else {
                finalTranscript = ' ' + transcript;
            }
            lastPauseTime = currentTime;
            
            journalTranscript += finalTranscript;
        } else {
            interimTranscript += transcript;
        }
    }
    
    // Update the preview directly without processing
    const preview = document.getElementById('journalPreview');
    if (preview) {
        preview.textContent = journalTranscript + (interimTranscript ? (' ' + interimTranscript) : '');
        preview.style.display = 'block';
    }
}

function stopVoiceJournal() {
    isJournaling = false;
    if (speechRecognition) {
        speechRecognition.stop();
    }
    
    // Show the preview and controls if there's content
    if (journalTranscript.trim()) {
        const preview = document.getElementById('journalPreview');
        const controls = document.getElementById('voiceControls');
        if (preview) {
            preview.textContent = journalTranscript;
            preview.style.display = 'block';
        }
        if (controls) {
            controls.style.display = 'block';
        }
    }
}

function showVoiceModal() {
    document.getElementById('voiceModal').classList.add('active');
}

function closeVoiceModal() {
    document.getElementById('voiceModal').classList.remove('active');
    stopVoiceJournal();
    document.getElementById('journalPreview').style.display = 'none';
    document.getElementById('voiceControls').style.display = 'none';
}

function toggleVoiceJournal() {
    const button = document.getElementById('journalVoiceButton');
    if (isJournaling) {
        stopVoiceJournal();
        button.innerHTML = '<i class="fas fa-microphone"></i><span>Start Recording</span>';
        button.classList.remove('listening');
        document.getElementById('journalPreview').style.display = 'block';
        document.getElementById('voiceControls').style.display = 'block';
    } else {
        startVoiceJournal();
        button.innerHTML = '<i class="fas fa-stop"></i><span>Stop Recording</span>';
        button.classList.add('listening');
    }
}

function insertVoiceText() {
    const text = document.getElementById('journalPreview').textContent;
    closeVoiceModal();
    showWriteModal();
    
    // Simply insert the raw transcribed text
    setTimeout(() => {
        const editor = document.getElementById('journalEntry');
        if (editor.isContentEditable) {
            editor.innerHTML += `<p>${text}</p>`;
        }
    }, 100);
}

function handleTextSelection() {
    const selection = window.getSelection();
    const toolbar = document.getElementById('floatingToolbar');
    
    if (selection.toString().trim() && isSelectionInEditor()) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        positionToolbar(rect, toolbar);
        showToolbar();
    } else {
        hideToolbar();
    }
}

function isSelectionInEditor() {
    const editor = document.getElementById('journalEntry');
    const selection = window.getSelection();
    return editor.contains(selection.anchorNode);
}

function positionToolbar(selectionRect, toolbar) {
    const toolbarHeight = toolbar.offsetHeight;
    const spacing = 8; // Reduced spacing
    
    // Get the selection coordinates
    let left = selectionRect.left;
    let top = selectionRect.top - toolbarHeight - spacing;
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const toolbarWidth = toolbar.offsetWidth;
    
    // If toolbar goes beyond right edge, adjust position
    if (left + toolbarWidth > viewportWidth) {
        left = viewportWidth - toolbarWidth - 10;
    }
    
    // If toolbar goes above viewport, position it below selection
    if (top < 10) {
        top = selectionRect.bottom + spacing;
    }
    
    // Account for scroll position
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;
    
    // Apply position without transform
    toolbar.style.left = `${left + scrollX}px`;
    toolbar.style.top = `${top + scrollY}px`;
    toolbar.style.transform = 'none';
}

function showToolbar() {
    const toolbar = document.getElementById('floatingToolbar');
    toolbar.classList.add('active');
}

function hideToolbar() {
    const toolbar = document.getElementById('floatingToolbar');
    toolbar.classList.remove('active');
}

// Add these event listeners to initEditor()
function initEditor() {
    const editor = document.getElementById('journalEntry');
    
    // Update paste event handler
    editor.addEventListener('paste', function(e) {
        e.preventDefault();
        
        // Get plain text
        let text = '';
        if (e.clipboardData || window.clipboardData) {
            text = (e.clipboardData || window.clipboardData).getData('text/plain');
        }
        
        // Use execCommand to insert text with current editor styling
        document.execCommand('insertText', false, text);
    });

    const toolbar = document.getElementById('floatingToolbar');
    
    // Handle text selection
    editor.addEventListener('mouseup', handleTextSelection);
    editor.addEventListener('keyup', (e) => {
        handleTextSelection();
        
        // Reset formatting when Enter is pressed
        if (e.key === 'Enter') {
            resetFormatting();
        }
    });
    
    // Add input event listener to track formatting changes
    editor.addEventListener('input', updateToolbarState);
    
    // Handle toolbar button clicks
    toolbar.addEventListener('click', (e) => {
        const button = e.target.closest('.toolbar-btn');
        if (button) {
            e.preventDefault();
            const command = button.dataset.command;
            document.execCommand(command, false, null);
            updateToolbarState();
        }
    });

    // Handle select controls
    toolbar.addEventListener('change', (e) => {
        if (e.target.classList.contains('toolbar-select')) {
            const command = e.target.dataset.command;
            const value = e.target.value;
            
            if (command === 'formatBlock') {
                document.execCommand(command, false, value);
            } else if (command === 'fontName') {
                document.execCommand(command, false, value);
            }
            updateToolbarState();
        }
    });

    // Add paste event handler
    editor.addEventListener('paste', function(e) {
        // Prevent the default paste
        e.preventDefault();
        
        // Get text only from clipboard
        let text = '';
        if (e.clipboardData || window.clipboardData) {
            text = (e.clipboardData || window.clipboardData).getData('text/plain');
        }
        
        // Split into paragraphs
        const paragraphs = text.split(/[\r\n]+/).filter(para => para.trim());
        
        // Create clean paragraphs with default styling
        const cleanHtml = paragraphs.map(para => {
            return `<p style="font-size: 16px; line-height: 1.8; margin: 0.5em 0;">${para}</p>`;
        }).join('');
        
        // Insert at cursor position
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        selection.deleteFromDocument();
        const range = selection.getRangeAt(0);
        const fragment = range.createContextualFragment(cleanHtml);
        range.insertNode(fragment);
        
        // Move cursor to end of pasted content
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Update journal stats
        updateJournalStats();
    });
}

function resetFormatting() {
    // Remove all active states from toolbar buttons
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Reset select elements to default values
    document.querySelectorAll('.toolbar-select').forEach(select => {
        select.value = select.querySelector('option').value;
    });
    
    // Move cursor to new paragraph with clean formatting
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const newParagraph = document.createElement('p');
    newParagraph.innerHTML = '<br>'; // Ensures paragraph has height even when empty
    
    range.insertNode(newParagraph);
    range.selectNodeContents(newParagraph);
    range.collapse(true); // Place cursor at start of new paragraph
    selection.removeAllRanges();
    selection.addRange(range);
    
    // Clear any existing formatting
    document.execCommand('removeFormat', false, null);
}

function updateToolbarState() {
    // Update button states based on current formatting
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        const command = btn.dataset.command;
        if (document.queryCommandState(command)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update select elements based on current formatting
    document.querySelectorAll('.toolbar-select').forEach(select => {
        const command = select.dataset.command;
        if (command === 'formatBlock') {
            const value = document.queryCommandValue(command);
            if (value) {
                select.value = value.toLowerCase();
            }
        } else if (command === 'fontName') {
            const value = document.queryCommandValue(command);
            if (value) {
                select.value = value;
            }
        }
    });
}

// Update the showWriteModal function
function showWriteModal() {
    document.getElementById('writeModal').classList.add('active');
    console.log('Initializing ambience player from showWriteModal');
    initAmbiencePlayer(); // This will start the music
    
    // Set initial creation date
    const dateElement = document.getElementById('creationDate');
    if (!dateElement.textContent) {
        const now = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        dateElement.textContent = now.toLocaleDateString('en-US', options);
    }
}

function closeWriteModal() {
    const currentContent = document.getElementById('journalEntry').innerHTML;
    if (currentContent.trim() !== lastContent.trim()) {
        if (!confirm('Are you sure you want to close? Any unsaved changes will be lost.')) {
            return;
        }
    }
    
    fadeOutAmbienceMusic(() => {
        document.getElementById('writeModal').classList.remove('active');
        document.getElementById('journalEntry').innerHTML = '';
        lastContent = '';
    });
}

// Update the showSaveModal function
function showSaveModal(type = 'text') {
    const saveModal = document.getElementById('saveModal');
    saveModal.classList.add('active');
    
    // Reset mood selection
    selectedMood = null;
    document.querySelectorAll('.mood-option').forEach(option => {
        option.classList.remove('active');
    });
    document.getElementById('moodError').style.display = 'none';
    
    // Store the type to know which modal to open after saving
    saveModal.dataset.nextAction = type;
    
    // Clear existing title and date for new journals
    if (!document.getElementById('journalTitle').dataset.originalFile) {
        document.getElementById('journalTitle').value = '';
        
        // Set default date to today
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('journalDate').value = today;
    }
    
    // Focus on title input
    document.getElementById('journalTitle').focus();
}

function closeSaveModal() {
    const saveModal = document.getElementById('saveModal');
    saveModal.classList.remove('active');
}

function updateJournalStats() {
    const content = document.getElementById('journalEntry');
    const text = content.innerText || '';
    
    // Update word count
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    document.getElementById('wordCount').textContent = words.length;
    
    // Update character count
    document.getElementById('charCount').textContent = text.length;
    
    // Set creation date if not already set
    const dateElement = document.getElementById('creationDate');
    if (!dateElement.textContent) {
        const now = new Date();
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        dateElement.textContent = now.toLocaleDateString('en-US', options);
    }
}

function openJournal(filename) {
    closeJournalsListModal();
    
    fetch("/load_journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Initializing ambience player from openJournal');
        showWriteModal(); // This will trigger initAmbiencePlayer()
        
        // Extract date and title from filename
        const [date, ...titleParts] = filename.replace('.txt', '').split('_');
        const title = titleParts.join(' ');
        
        // Set the form fields
        document.getElementById('journalTitle').value = title;
        document.getElementById('journalDate').value = date;
        document.getElementById('journalEntry').innerHTML = data.entry;
        
        // Update creation date with the journal's date
        const creationDate = new Date(date);
        const options = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        document.getElementById('creationDate').textContent = creationDate.toLocaleDateString('en-US', options);
        
        // Update last content to prevent unsaved changes warning
        lastContent = data.entry;
    })
    .catch(error => {
        console.error('Error loading journal:', error);
        alert('Error loading journal. Please try again.');
    });
}

function listAvailableJournals() {
    const list = document.getElementById('journalsList');
    list.innerHTML = '<li class="loading">Loading journals...</li>';
    
    fetch("/list_journals")
        .then(response => response.json())
        .then(data => {
            list.innerHTML = '';
            if (data.journals.length === 0) {
                list.innerHTML = '<li class="no-journals">No journals found</li>';
                return;
            }
            
            data.journals.forEach(filename => {
                const li = document.createElement('li');
                li.className = 'journal-item';
                
                // Extract just the title part (remove date prefix and .txt extension)
                const title = filename.split('_').slice(1).join(' ').replace('.txt', '');
                
                li.innerHTML = `
                    <div class="journal-info">
                        <span class="journal-title">${title}</span>
                    </div>
                    <button onclick="openJournal('${filename}')" class="open-btn">
                        <i class="fas fa-arrow-right"></i>
                    </button>
                `;
                list.appendChild(li);
            });
        })
        .catch(error => {
            list.innerHTML = '<li class="error">Error loading journals</li>';
            console.error('Error loading journals:', error);
        });
}

function initAmbiencePlayer() {
    // First, stop any existing playback
    stopAmbienceMusic();
    
    // Check if music is enabled
    if (localStorage.getItem('musicEnabled') !== 'true') {
        console.log('Music is disabled in settings');
        return;
    }
    
    try {
        const selectedMusic = localStorage.getItem('selectedMusic') || 'nature';
        const volume = localStorage.getItem('musicVolume') || 50;
        
        console.log('Starting music:', selectedMusic, 'volume:', volume);
        
        // Create new audio player
        ambiencePlayer = new Audio();
        ambiencePlayer.src = `/static/music/${selectedMusic}.mp3`;
        ambiencePlayer.loop = true;
        ambiencePlayer.volume = volume / 100;
        
        // Add error handling
        ambiencePlayer.onerror = (e) => {
            console.error('Audio error:', e);
            console.error('Failed to load:', ambiencePlayer.src);
        };

        // Add load handling
        ambiencePlayer.oncanplaythrough = () => {
            console.log('Audio loaded, starting playback');
            const playPromise = ambiencePlayer.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error('Playback failed:', error);
                });
            }
        };
        
    } catch (error) {
        console.error('Error initializing audio:', error);
    }
}

function stopAmbienceMusic() {
    if (ambiencePlayer) {
        try {
            ambiencePlayer.pause();
            ambiencePlayer.currentTime = 0;
            ambiencePlayer = null;
        } catch (error) {
            console.error('Error stopping audio:', error);
        }
    }
}

function fadeOutAmbienceMusic(callback) {
    if (!ambiencePlayer) return callback?.();
    
    const fadeOutDuration = 1000; // 1 second fade
    const initialVolume = ambiencePlayer.volume;
    const fadeSteps = 20; // Number of steps in fade
    const volumeStep = initialVolume / fadeSteps;
    const stepDuration = fadeOutDuration / fadeSteps;
    
    let currentStep = 0;
    
    const fadeInterval = setInterval(() => {
        currentStep++;
        const newVolume = initialVolume - (volumeStep * currentStep);
        
        if (currentStep >= fadeSteps || newVolume <= 0) {
            clearInterval(fadeInterval);
            ambiencePlayer.pause();
            ambiencePlayer = null;
            callback?.();
        } else {
            ambiencePlayer.volume = newVolume;
        }
    }, stepDuration);
}

function toggleMute() {
    if (!ambiencePlayer) return;
    
    const muteBtn = document.querySelector('.mute-btn i');
    
    if (ambiencePlayer.muted) {
        ambiencePlayer.muted = false;
        muteBtn.className = 'fas fa-volume-up';
    } else {
        ambiencePlayer.muted = true;
        muteBtn.className = 'fas fa-volume-mute';
    }
}