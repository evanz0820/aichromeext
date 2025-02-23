document.addEventListener('DOMContentLoaded', () => {
  if (chrome && chrome.storage && chrome.storage.local) { //Check if chrome storage exists.
      chrome.storage.local.get('geminiApiKey', (data) => {
          if (data.geminiApiKey) {
              document.getElementById('apiKeyInput').value = data.geminiApiKey;
          }
      });
  } else {
      console.error("Chrome storage API is not available.");
  }
});

document.getElementById('saveApiKeyButton').addEventListener('click', () => {
  if (chrome && chrome.storage && chrome.storage.local) {
      const apiKey = document.getElementById('apiKeyInput').value;
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
          alert('API key saved!');
      });
  } else {
      console.error("Chrome storage API is not available.");
  }
});

document.getElementById('autofillButton').addEventListener('click', () => {
  if (chrome && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get('geminiApiKey', (data) => {
          if (!data.geminiApiKey) {
              alert('Please enter and save your Gemini API key.');
              return;
          }
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              chrome.scripting.executeScript({
                  target: { tabId: tabs[0].id },
                  function: autofill,
                  args: [data.geminiApiKey],
              });
          });
      });
  } else {
      console.error("Chrome storage API is not available.");
  }
});

async function autofill(apiKey) {
  const pageText = document.body.innerText;
  const textareas = document.querySelectorAll('textarea');
  const inputs = document.querySelectorAll('input[type="text"]');
  const allInputs = [...textareas, ...inputs];

  if (allInputs.length === 0) {
      alert("No text inputs found on this page.");
      return;
  }

  async function generateText(prompt, apiKey) {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey; // Replace with the correct Gemini API endpoint

      try {
          const response = await fetch(url, {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
              }),
          });

          if (!response.ok) {
              console.error('Gemini API error:', response);
              alert('Gemini API error. Check console.');
              return "Error generating text.";
          }

          const data = await response.json();
          try {
              return data.candidates[0].content.parts[0].text;
          } catch (error) {
              console.error("error parsing Gemini API response", data, error);
              alert("Error parsing Gemini API response. Check console.");
              return "Error parsing response.";
          }
      } catch (fetchError) {
          console.error("Fetch error:", fetchError);
          alert("Network error. Check console.");
          return "Network error.";
      }
  }

  for (const input of allInputs) {
      const placeholder = input.placeholder;
      const label = getLabelForElement(input);
      const prompt = `Based on the following page content: "${pageText}" and the input field with placeholder "${placeholder}" and label "${label}", generate relevant text.`;

      const generatedText = await generateText(prompt, apiKey);
      input.value = generatedText;
  }

  function getLabelForElement(element) {
    const id = element.id;
    console.log("Input ID:", id); //Added console log
    if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
            console.log("Found label:", label.textContent.trim()); //added console log
            return label.textContent.trim();
        }
    }
    const parent = element.parentElement;
    if (parent) {
        const previousSibling = element.previousElementSibling;
        if (previousSibling && previousSibling.tagName === 'LABEL') {
            console.log("Found previous sibling label:", previousSibling.textContent.trim()); //added console log
            return previousSibling.textContent.trim();
        }
    }
    console.log("No label found."); //added console log
    return "";
  }
}