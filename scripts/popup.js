const isFirefox = navigator.userAgent.toLowerCase().includes('firefox');
const gradeOverlay = document.getElementById('gradeOverlay');
const sampleGrade = document.getElementById('sample_grade');
const sampleGradeError = document.getElementById('sample_grade_error');
const textColor = document.getElementById(`text_color${isFirefox ? '_firefox' : ''}`);
const backgroundColor = document.getElementById(`background_color${isFirefox ? '_firefox' : ''}`);
const overlayShowLetterGrade = document.getElementById('dashboard_letter_grade'); 
const gradesPageShowClassStats = document.getElementById('show_class_statistics');
const gradesPageShowDrops = document.getElementById('show_drops');
const gradesPageShowGradingStandard = document.getElementById('show_grading_standard');
const contactFormButton = document.getElementById('sendMessage');
const fontStyleDropdown = document.getElementById('fontStyle');
const saveChanges = document.getElementById('saveChanges');
const saveChangesLabel = document.getElementById('saveChangesLabel');
const sendMessageLabel = document.getElementById('sendMessageLabel');
const nameInput = document.getElementById('name');
const messageInput = document.getElementById('message');
const linksContainer = document.getElementById('links');
const webhookURL = 'https://zingy-moonbeam-a2a551.netlify.app/.netlify/functions/api';
const globalConfig = {};
const config = {};

const hideMessageLabel = function() {
  sendMessageLabel.style.visibility = 'hidden';
  sendMessageLabel.textContent = '';
}

const clearSaveMessage = function() {
  saveChangesLabel.style.visibility = 'hidden';
  saveChangesLabel.textContent = '';
}

contactFormButton.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const message = messageInput.value.trim();
  if (message === '') {
    sendMessageLabel.style.visibility = 'visible';
    sendMessageLabel.style.color = 'red';
    sendMessageLabel.textContent = "Please fill out the message field!";
    return;
  } else if (message.length >= 1024) {
    sendMessageLabel.style.visibility = 'visible';
    sendMessageLabel.style.color = 'red';
    sendMessageLabel.textContent = "Your message is too long!";
    return;
  }
  fetch(webhookURL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, message }),
  })
  .then(response => {
    if (response.ok) {
      sendMessageLabel.style.visibility = 'visible';
      sendMessageLabel.style.color = 'black';
      sendMessageLabel.textContent = "Message sent successfully!";
      nameInput.value = '';
      messageInput.value = '';
    } else {
      sendMessageLabel.style.visibility = 'visible';
      sendMessageLabel.style.color = 'red';
      sendMessageLabel.textContent = "Message failed to send!";
    }
  });
});
saveChanges.addEventListener('click', async () => {
  config.text_color = isFirefox ? textColor.dataset.currentColor :  textColor.value;
  config.background_color = isFirefox ? backgroundColor.dataset.currentColor : backgroundColor.value;
  config.font_style = fontStyleDropdown.value;
  config.show_letter_grade = overlayShowLetterGrade.checked;
  globalConfig.class_statistics_default_view = gradesPageShowClassStats.checked;
  globalConfig.grading_standard_default_view = gradesPageShowGradingStandard.checked;
  globalConfig.drops_default_view = gradesPageShowDrops.checked;
  try {
    await chrome.storage.local.set(globalConfig)
    await chrome.storage.local.set({ grade_overlay: config });
  } catch (err) {
    saveChangesLabel.style.visibility = 'visible';
    saveChangesLabel.style.color = 'red';
    saveChangesLabel.textContent = "Changes failed to save!";
  }
  saveChangesLabel.style.visibility = 'visible';
  saveChangesLabel.style.color = 'black';
  saveChangesLabel.textContent = "Changes saved successfully!";
});
nameInput.addEventListener('input', hideMessageLabel);
messageInput.addEventListener('input', hideMessageLabel);
// Add event listeners for configuring the grade overlay preview
sampleGrade.addEventListener('input', () => updateGradeOverlay('grade'));
overlayShowLetterGrade.addEventListener('input', () => updateGradeOverlay('letter_grade'));
textColor.addEventListener('input', () => updateGradeOverlay('text_color'));
backgroundColor.addEventListener('input', () => updateGradeOverlay('background_color'));
  // TODO Consider adding custom font custom via Google Fonts
fontStyleDropdown.addEventListener('change', () => updateGradeOverlay('font_style'));
// Add event listeners for updating the save text when interacting with the class config
gradesPageShowGradingStandard.addEventListener('input', clearSaveMessage);
gradesPageShowClassStats.addEventListener('input', clearSaveMessage);
gradesPageShowDrops.addEventListener('input', clearSaveMessage);
linksContainer.firstElementChild.addEventListener('click', () => chrome.tabs.create({ url: 'https://github.com/NerdyGamer05/CanvasGradesPro/issues' }));
linksContainer.lastElementChild.addEventListener('click', () => chrome.tabs.create({ url: 'https://forms.gle/CVf8hfLLBRYCzLhp7' }));
document.addEventListener('DOMContentLoaded', async () => {
  const obj = await chrome.storage.local.get();
  const overlayConfig = obj.grade_overlay ?? {};
  // Set popup border color using primary color (same color as Canvas)
  document.body.style.backgroundColor = obj.primary_color ?? '#990000';
  // Display alternative color inputs if firefox is the current browser (normal color input closes the input for firefox)
  // Or just configure the default value normally if firefox is not the current browser
  if (isFirefox) {
    document.getElementById('text_color').style.display = 'none';
    document.getElementById('background_color').style.display = 'none';
    textColor.style.display = 'inline-block';
    backgroundColor.style.display = 'inline-block';
    // Load default values & configurations for the color pickers
    new JSColor(textColor, {
      value: overlayConfig.text_color || "#ffffff",
    });
    new JSColor(backgroundColor, {
      value: overlayConfig.background_color || "#000000",
    });
  } else {
    textColor.value = overlayConfig.text_color ?? "#ffffff";
    backgroundColor.value = overlayConfig.background_color ?? "#000000";
  }
  // Configure the remaining grade overlay settings 
  fontStyleDropdown.value = overlayConfig.font_style ?? 'Cursive'; // Font style dropdown
  overlayShowLetterGrade.checked = overlayConfig.show_letter_grade ?? true; // Letter grade display checkbox
  // Configure the course page settings (also copy course page config to globalConfig variable)
  gradesPageShowClassStats.checked = globalConfig.class_statistics_default_view = obj.class_statistics_default_view ?? true;
  gradesPageShowGradingStandard.checked = globalConfig.grading_standard_default_view = obj.grading_standard_default_view ?? true;
  gradesPageShowDrops.checked = globalConfig.drops_default_view = obj.drops_default_view ?? true;
  // Copy overlay config to config variable
  Object.assign(config, overlayConfig);
  for (const fontStyleOption of fontStyleDropdown.children) {
    fontStyleOption.style.fontFamily = fontStyleOption.textContent;
  }
  updateGradeOverlay(null);
});

const default_grading_standard = {
  97: 'A+',
  93: 'A',
  90: 'A-',
  87: 'B+',
  83: 'B',
  80: 'B-',
  77: 'C+',
  73: 'C',
  70: 'C-',
  67: 'D+',
  63: 'D',
  60: 'D-',
  0: 'F', // everything else is a F
}

const getLetterGrade = function(grade) {
    if (grade < 0) {
    return 'N/A';
  }
  // Default grading scheme (sorting in descending order)
  const weights = Object.keys(default_grading_standard).map(Number);
  // Binary search on the weights
  let left = 0, right = weights.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const rightMid = weights[mid+1] ?? Infinity;
    if (grade >= weights[mid] && grade < rightMid) {
      return default_grading_standard[weights[mid]];
    } else if (grade < weights[mid]) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return 'N/A';
}

const updateGradeOverlay = function(change) {
  saveChangesLabel.style.visibility = 'hidden';
  // If change is null, then update everything (used for intial configuration)
  if (change === null) {
    const grade = validateGrade(sampleGrade.value);
    if (grade === null) {
      return;
    }
    fontStyleDropdown.style.fontFamily = fontStyleDropdown.value;
    gradeOverlay.style.fontFamily = fontStyleDropdown.value;
    gradeOverlay.style.backgroundColor = backgroundColor.value;
    gradeOverlay.style.color = textColor.value;
    gradeOverlay.textContent = `${grade}%${overlayShowLetterGrade.checked ? `\u0020(${getLetterGrade(grade)})` : ''}`
  }
  if (change === 'font_style') {
    fontStyleDropdown.style.fontFamily = fontStyleDropdown.value;
    gradeOverlay.style.fontFamily = fontStyleDropdown.value;
  } else if (change === 'text_color') {
    gradeOverlay.style.color = textColor.value;
  } else if (change === 'background_color') {
    gradeOverlay.style.backgroundColor = backgroundColor.value;
  } else if (change === 'grade' || change === 'letter_grade') {
    const grade = validateGrade(sampleGrade.value);
    if (grade !== null) {
      gradeOverlay.textContent = `${grade}%${overlayShowLetterGrade.checked ? `\u0020(${getLetterGrade(grade)})` : ''}`
    }
  }
}

const validateGrade = function(input) {
  input = input.trim();
  const grade = input !== '' && /^(\d+)?\.?(\d+)?$/.test(input) ? +input : null;
  // Bad grade input
  if (grade === null) {
    sampleGradeError.style.visibility = 'visible';
    return null;
  }
  sampleGradeError.style.visibility = 'hidden';
  return grade;
}