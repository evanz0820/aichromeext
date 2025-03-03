document.addEventListener('DOMContentLoaded', () => {
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('geminiApiKey', (data) => {
      if (data.geminiApiKey) {
        document.getElementById('apiKeyInput').value = data.geminiApiKey;
      }
    });
  } else {
    console.error("Chrome storage API is not available.");
    showStatus("Error: Chrome storage API unavailable", true);
  }
  
  updatePageInfo();
});

function showStatus(message, isError = false) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  
  if (isError) {
    statusElement.style.backgroundColor = '#ffebee';
    statusElement.style.color = '#c62828';
  } else {
    statusElement.style.backgroundColor = '#f1f1f1';
    statusElement.style.color = '#000000';
  }
}

function showLoading(message) {
  const statusElement = document.getElementById('status');
  const loadingSpinner = document.createElement('span');
  loadingSpinner.className = 'loading';
  
  statusElement.textContent = '';
  statusElement.appendChild(loadingSpinner);
  statusElement.appendChild(document.createTextNode(' ' + message));
}

function updatePageInfo() {
  showLoading("Checking page...");
  
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    
    if (!activeTab.url || activeTab.url.startsWith('chrome://')) {
      showStatus("Cannot run extension on this page.", true);
      document.getElementById('autofillButton').disabled = true;
      return;
    }
    
    try {
      chrome.tabs.sendMessage(activeTab.id, { action: "getPageInfo" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("Content script not loaded yet, injecting...", chrome.runtime.lastError);
          
          chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            files: ['content.js']
          }, () => {
            if (chrome.runtime.lastError) {
              showStatus("Error: " + chrome.runtime.lastError.message, true);
            } else {
              setTimeout(updatePageInfo, 500);
            }
          });
          return;
        }
        
        if (response && response.success) {
          showStatus(`Ready to autofill ${response.inputCount} input fields on this page.`);
          document.getElementById('autofillButton').disabled = response.inputCount === 0;
        } else {
          showStatus("Could not get page information.", true);
        }
      });
    } catch (err) {
      showStatus("Error: " + err.message, true);
    }
  });
}

document.getElementById('saveApiKeyButton').addEventListener('click', () => {
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  
  if (!apiKey) {
    showStatus("Please enter a valid API key", true);
    return;
  }
  
  showLoading("Saving API key...");
  
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
      if (chrome.runtime.lastError) {
        showStatus("Error saving API key: " + chrome.runtime.lastError.message, true);
      } else {
        showStatus('API key saved successfully!');
        setTimeout(() => updatePageInfo(), 1000);
      }
    });
  } else {
    showStatus("Error: Chrome storage API unavailable", true);
  }
});

document.getElementById('autofillButton').addEventListener('click', () => {
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('geminiApiKey', (data) => {
      if (!data.geminiApiKey) {
        showStatus('Please enter and save your Gemini API key.', true);
        return;
      }
      
      showLoading('Starting autofill process...');
      
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.tabs.sendMessage(
          tabs[0].id, 
          { action: "autofill", apiKey: data.geminiApiKey },
          (response) => {
            if (chrome.runtime.lastError) {
              showStatus('Error: ' + chrome.runtime.lastError.message, true);
            }
          }
        );
      });
    });
  } else {
    showStatus("Error: Chrome storage API unavailable", true);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "showAlert") {
    showStatus(request.message);
  }
});