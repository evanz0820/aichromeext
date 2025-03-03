(function() {
  if (window.geminiAutofillInitialized) return;
  window.geminiAutofillInitialized = true;

  window.geminiPageContextData = window.geminiPageContextData || null;

  function extractPageContext() {
    const pageTitle = document.title;
    
    const metaDescription = document.querySelector('meta[name="description"]')?.content || '';
    
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map(h => h.textContent.trim())
      .join(' | ');
    
    const inputContexts = [];
    
    document.querySelectorAll('textarea, input[type="text"]').forEach((input, index) => {
      const parent = input.closest('div, form, section') || input.parentElement;
      let nearbyText = '';
      
      if (parent) {
        nearbyText = Array.from(parent.querySelectorAll('p, h1, h2, h3, h4, label, div'))
          .map(el => el.textContent.trim())
          .filter(text => text.length > 0)
          .join(' | ')
          .substring(0, 300); // Limit context length
      }
      
      inputContexts.push({
        elementIndex: index,
        id: input.id || '',
        name: input.name || '',
        placeholder: input.placeholder || '',
        nearbyText: nearbyText
      });
    });
    
    return {
      pageTitle,
      metaDescription,
      headings,
      inputContexts,
      elements: Array.from(document.querySelectorAll('textarea, input[type="text"]'))
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageInfo") {
      window.geminiPageContextData = extractPageContext();
      sendResponse({
        success: true,
        inputCount: window.geminiPageContextData.elements.length,
        pageContext: {
          pageTitle: window.geminiPageContextData.pageTitle,
          inputCount: window.geminiPageContextData.elements.length
        }
      });
      return true;
    }
    
    if (request.action === "autofill") {
      handleAutofill(request.apiKey);
      return true;
    }
  });

  async function handleAutofill(apiKey) {
    if (!window.geminiPageContextData) {
      window.geminiPageContextData = extractPageContext();
    }
    
    const allInputs = window.geminiPageContextData.elements;
    
    if (allInputs.length === 0) {
      chrome.runtime.sendMessage({
        action: "showAlert", 
        message: "No text inputs found on this page."
      });
      return;
    }
    
    let completedCount = 0;
    let errorCount = 0;
    
    chrome.runtime.sendMessage({
      action: "showAlert", 
      message: `Starting to fill ${allInputs.length} fields...`
    });
    
    for (let i = 0; i < allInputs.length; i++) {
      const input = allInputs[i];
      const inputContext = window.geminiPageContextData.inputContexts[i];
      
      try {
        console.log(`Processing input ${i+1}/${allInputs.length}: ${inputContext.id || inputContext.name || 'unnamed'}`);
        
        const placeholder = input.placeholder || "";
        const name = input.name || "";
        const id = input.id || "";
        const label = getLabelForElement(input) || "";
        const nearbyText = inputContext.nearbyText || "";
        
        const existingValue = input.value || "";
        
        const prompt = createGeminiPrompt({
          pageTitle: window.geminiPageContextData.pageTitle,
          inputName: name,
          inputId: id, 
          placeholder,
          label,
          nearbyText,
          existingValue
        });
        
        console.log("Sending prompt to Gemini:", prompt.substring(0, 100) + "...");
        
        const generatedText = await generateTextWithGemini(prompt, apiKey);
        
        if (generatedText && !generatedText.includes("Error")) {
          console.log(`Filling input with text: ${generatedText.substring(0, 30)}...`);
          input.value = generatedText;
          
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          
          completedCount++;
          
          if (allInputs.length > 5 && i % 3 === 0) {
            chrome.runtime.sendMessage({
              action: "showAlert", 
              message: `Progress: ${completedCount}/${allInputs.length} fields filled...`
            });
          }
        } else {
          console.error("Error generating text for input:", generatedText);
          errorCount++;
        }
      } catch (error) {
        console.error("Error filling input:", error);
        errorCount++;
      }
    }
    
    chrome.runtime.sendMessage({
      action: "showAlert", 
      message: `Completed: ${completedCount} filled, ${errorCount} errors out of ${allInputs.length} fields`
    });
  }

  function createGeminiPrompt({pageTitle, inputName, inputId, placeholder, label, nearbyText, existingValue}) {
    return `Page: "${pageTitle}"
    
  Input field details:
  ${inputName ? `- Name: "${inputName}"` : ''}
  ${inputId ? `- ID: "${inputId}"` : ''}
  ${placeholder ? `- Placeholder: "${placeholder}"` : ''}
  ${label ? `- Label: "${label}"` : ''}
  ${existingValue ? `- Current value: "${existingValue}"` : ''}
  
  Context around input:
  "${nearbyText}"
  
  Based on this information, generate appropriate text to fill in this input field. Be concise, relevant, and match the expected format and tone. If it looks like a question or prompt requires a personal response, provide a generic but thoughtful answer that a user might give. If it seems like a form field (name, email, etc.), provide a generic placeholder instead.`;
  }

  function getLabelForElement(element) {
    const id = element.id;
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        return label.textContent.trim();
      }
    }
    
    let parent = element.parentElement;
    while (parent) {
      if (parent.tagName === 'LABEL') {
        return parent.textContent.trim().replace(element.value, '');
      }
      parent = parent.parentElement;
    }
    
    let previousElement = element.previousElementSibling;
    while (previousElement) {
      if (previousElement.tagName === 'LABEL' || 
          previousElement.tagName === 'DIV' || 
          previousElement.tagName === 'SPAN') {
        return previousElement.textContent.trim();
      }
      previousElement = previousElement.previousElementSibling;
    }
    
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }
    
    return "";
  }

  async function generateTextWithGemini(prompt, apiKey) {
    const modelNames = [
      "gemini-pro",
      "gemini-1.5-pro",
      "gemini-ultra",
      "gemini-1.0-pro"
    ];
    
    const errors = [];
    
    for (const modelName of modelNames) {
      const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=${apiKey}`;
      
      try {
        console.log(`Trying Gemini API with model: ${modelName}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 250,
            }
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Gemini API error with model ${modelName}:`, errorText);
          errors.push(`${modelName}: ${errorText}`);
          continue;
        }
        
        const data = await response.json();
        console.log("Gemini API response:", data);
        
        if (data.candidates && 
            data.candidates[0] && 
            data.candidates[0].content && 
            data.candidates[0].content.parts && 
            data.candidates[0].content.parts[0]) {
          
          // Save working model name for future use
          window.geminiWorkingModel = modelName;
          console.log(`Found working Gemini model: ${modelName}`);
          
          return data.candidates[0].content.parts[0].text;
        } else {
          errors.push(`${modelName}: Unexpected response structure`);
        }
      } catch (error) {
        console.error(`Error with ${modelName}:`, error);
        errors.push(`${modelName}: ${error.message}`);
      }
    }
    
    if (window.geminiWorkingModel && !modelNames.includes(window.geminiWorkingModel)) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${window.geminiWorkingModel}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 250,
            }
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.candidates?.[0]?.content?.parts?.[0]) {
            return data.candidates[0].content.parts[0].text;
          }
        }
      } catch (error) {
        console.error(`Error with cached model ${window.geminiWorkingModel}:`, error);
      }
    }
    chrome.runtime.sendMessage({
      action: "showAlert", 
      message: `Gemini API error: Failed with all models. Check console for details.`
    });
    
    console.error("All Gemini models failed:", errors);
    return "Error: No working Gemini model found. Please check your API key and try again.";
  }
})();