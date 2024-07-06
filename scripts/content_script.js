// Check if an object is empty 
// Note: Returns true if the object is null or undefined
const isObjectEmpty = function(obj) {
  if (obj === null || obj === undefined) {
    return true;
  }
  for (const _prop in obj) {
    return false;
  }
  return true;
}

// Numbers represent the lower limit for a given letter grade
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

// Dashboard page
if (document.title === 'Dashboard') {
  fetch('/api/v1/dashboard/dashboard_cards', {
    method: 'GET'
  })
  .then(response => response.json())
  .then(cards => {
    return Promise.all(cards.map(async card => {
      const course = await (await fetch(`api/v1/courses/${card.id}`, {
        method: 'GET'
      })).json();
      return {
        id: card.id,
        course_code: card.courseCode,
        apply_assignment_group_weights: course.apply_assignment_group_weights,
        grading_standard_id: course.grading_standard_id
      }
    }));
  })
  .catch(() => {
    // Probably not on a Canvas page, so stop the execution of this code
    thisFunctionDoesNotExistAndWasCreatedWithTheOnlyPurposeOfStopJavascriptExecutionOfAllTypesIncludingCatchAndAnyArbitraryWeirdScenario();
  })
  .then(async courses => {
    // Listen for updating grade overlays when the settings are updated using the popup
    chrome.storage.onChanged.addListener((changes, _namespace) => {
      for (const [key, { newValue: config }] of Object.entries(changes)) {
        // If the storage update was not for the grade overlay, then ignore it
        if (key !== 'grade_overlay') {
          continue;
        }
        // Get all of the grade overlays
        const gradeOverlays = document.getElementById('DashboardCard_Container').querySelectorAll('.grade_overlay');
        for (const gradeOverlay of gradeOverlays) {
          // Access grade and letter grade from dataset map (avoid DOM parsing and any unnecessary recalculations)
          const { grade, letterGrade } = gradeOverlay.dataset;
          // Update styling for the grade overlays
          gradeOverlay.style.backgroundColor = config.background_color;
          gradeOverlay.style.color = config.text_color;
          gradeOverlay.style.fontFamily = config.font_style;
          gradeOverlay.textContent = grade === 'NG' ? `No Grade ${config.show_letter_grade ? '(NG)' : ''}` : `${grade}%`;
          // Show the letter grade on the display if configured
          if (letterGrade !== 'null' && config.show_letter_grade) {
            gradeOverlay.textContent += `\u2004(${letterGrade})`; 
          }
        }
      }
    });
    // Get all config settings from storage
    const config = await chrome.storage.local.get();
    // Store the primary color (used for customizing the popup)
    if (config.primary_color === undefined) {
      config.primary_color = getComputedStyle(document.body).getPropertyValue('--dt-color-primary');
      saveConfig({ primary_color: config.primary_color });
    }
    // Return config for the current course and the global config
    return [courses, config];
  })
  .then(async ([courses,config]) => {
    // Get the container for all of the dashboard cards
    const cardsContainer = document.getElementById('DashboardCard_Container').children[0].children[0];
    // Map all of the courses to the grades in that course
    const gradePromises = courses.map(async (course, index) => {
      // Attempt to get the card for the current course
      const card = cardsContainer.querySelector(`a[href='/courses/${course.id}']`)?.parentElement ?? null;
      if (card === null) {
        courses[index] = null;
        return null;
      }  
      try {
        // Get the config for the current class (default to an empty object if the current class has no config)
        const classConfig = config[course.id] ?? {};
        const overlayConfig = config.grade_overlay ?? {};
        // Get the grade for the current class (using config and class grading standard if available)
        const grade = (await getCourseGrade(courses[index], classConfig, null, null))[0];
        // Use the default grading standard if the current class has no grading standard
        if (isObjectEmpty(classConfig.grading_standard)) {
          classConfig.grading_standard = course.grading_standard_id !== null ? (await retrieveGradingStandard(course.id, course.grading_standard_id)) : config.default_grading_standard ?? default_grading_standard;
        }
        // Get the letter grade for the current course
        const letterGrade = await getLetterGrade(classConfig.grading_standard, grade);
        const gradeOverlay = document.createElement('a');
        gradeOverlay.href = `/courses/${course.id}/grades`;
        // Style the grade overlay using config (or use default values if there isn't any)
        gradeOverlay.style.position = 'absolute';
        gradeOverlay.style.marginLeft = '.7em';
        gradeOverlay.style.marginTop = '.7em';
        gradeOverlay.style.padding = '2px 6px 2px';
        gradeOverlay.style.borderRadius = '5px';
        gradeOverlay.style.zIndex = 1;
        gradeOverlay.style.display = 'none';
        gradeOverlay.style.backgroundColor = overlayConfig.background_color ?? 'black';
        gradeOverlay.style.color = overlayConfig.text_color ?? 'white';
        gradeOverlay.style.fontFamily = overlayConfig.font_style ?? 'cursive';
        gradeOverlay.textContent = grade === 'NG' ? 'No Grade (NG)' : `${grade}%`;
        gradeOverlay.dataset.grade = grade;
        gradeOverlay.dataset.letterGrade = letterGrade;
        // Show the letter grade on the display if configured
        if (letterGrade !== null && (overlayConfig.show_letter_grade ?? true)) {
          gradeOverlay.textContent += `\u2004(${letterGrade})`; 
        }
        gradeOverlay.classList.add('grade_overlay');
        card.prepend(gradeOverlay);
        return grade;
      } catch (error) {
        console.error(`Failed to get grade for course ${course.id}:`, error);
        return null;
      }
    });
    // Wait for all of the grades to be set before continuing
    await Promise.all(gradePromises)
  })
  .then(() => {
    // Grades overlays were all configured, so show them all at once
    document.querySelectorAll('.grade_overlay').forEach(gradeOverlay => {
      gradeOverlay.style.display = 'block';
    });
  })
} else if (/courses\/\d+\/grades/.test(window.location.href)) { // Course grades page
  // Check if the page is valid (if the page is an actual courses' grade page)
  if (document.getElementById('not_found_root') !== null) {
    thisFunctionDoesNotExistAndWasCreatedWithTheOnlyPurposeOfStopJavascriptExecutionOfAllTypesIncludingCatchAndAnyArbitraryWeirdScenario();
  }
  document.getElementById('not_right_side').style.zoom = '83%';
  const courseID = RegExp(/courses\/(\d+)\/grades/).exec(window.location.href)[1];
  Promise.resolve(chrome.storage.local.get())
  .then(data => {
   // Get class-specific config
   const config = data[courseID] ?? {};
   // Collect global config from the browser extension storage that is relevant
   const globalConfig = {};
   // Load default settings from config, while using a fallback value if necessary
   globalConfig.grading_standard_default_view = data.grading_standard_default_view ?? true; 
   globalConfig.drops_default_view = data.drops_default_view ?? true;
   globalConfig.class_statistics_default_view = data.class_statistics_default_view ?? true;
   globalConfig.default_grading_standard = data.default_grading_standard ?? null;
   // The classGradingStandard is only for storing the class specified standard (if there is one)
   return [config, globalConfig, !isObjectEmpty(config.grading_standard) ? config.grading_standard : null];
  })
  .then(async ([config, globalConfig, classGradingStandard]) => {
    const tableContainer = document.getElementById('assignments-not-weighted');
    // Create table element if it does not exist
    if (tableContainer.querySelector('table.summary:not([id])') === null) {
      const table = document.createElement('table');
      table.classList.add('summary');
      tableContainer.firstElementChild.appendChild(table);
    }
    // Hide the table before it is configured
    const course = await (await fetch(`/api/v1/courses/${courseID}?include[]=total_scores`, {
      method: 'GET'
    })).json();
    const courseAssignments = await (await fetch(`/api/v1/courses/${courseID}/assignment_groups?include[]=assignments&include[]=score_statistics&include[]=overrides&include[]=submission`, {
      method: 'GET'
    })).json();
    if (classGradingStandard === null && course.grading_standard_id !== null) {
      classGradingStandard = await retrieveGradingStandard(course.id, course.grading_standard_id);
    }

    // If there is no weighting rules in config, then use the class default (if there is one)
    // If the class does not use weighting, then leave the value

    // Initialize table elements if it was just created (table did not exist initially)
    // Use weights from config if they are any, or else leave it blank
    if (!course.apply_assignment_group_weights) {
      // Create elements for the table head
      const thead = document.createElement('thead');
      const thead_row = document.createElement('tr');
      const thead_group = document.createElement('th');
      const thead_weight = document.createElement('th');
      thead_group.scope = 'col';
      thead_group.textContent = 'Group';
      thead_weight.scope = 'col';
      thead_weight.textContent = 'Weight';
      // Add the table head row to the table head
      thead_row.appendChild(thead_group);
      thead_row.appendChild(thead_weight);
      thead.appendChild(thead_row);
      // Create elements for the table body
      const tbody = document.createElement('tbody');
      for (const group of courseAssignments) {
        const tbody_row = document.createElement('tr'); 
        const tbody_group = document.createElement('th');
        const tbody_weight = document.createElement('td');
        tbody_group.scope = 'col';
        tbody_group.textContent = group.name;
        tbody_weight.scope = 'col'; 
        tbody_weight.textContent = config.weights?.[group.name] !== undefined ? config.weights[group.name] + '%' : '';
        // Add table body row to the table body
        tbody_row.appendChild(tbody_group);
        tbody_row.appendChild(tbody_weight);
        tbody.appendChild(tbody_row);
      }
      // Add the "Total" row
      const tbody_row_total = document.createElement('tr');
      const tbody_group = document.createElement('th');
      const tbody_weight = document.createElement('td');
      tbody_group.scope = 'col';
      tbody_group.textContent = 'Total';
      tbody_weight.scope = 'col';
      tbody_weight.textContent = '100%';
      tbody_row_total.style.fontWeight = 'bold';
      tbody_row_total.appendChild(tbody_group);
      tbody_row_total.appendChild(tbody_weight);
      tbody.appendChild(tbody_row_total);
      // Add the table head and body
      const table = tableContainer.querySelector('table.summary');
      table.appendChild(thead);
      table.appendChild(tbody);
      table.style.display = 'none';
    }
    // If the table existed initially and if there are weights available, then use these weights
    if (course.apply_assignment_group_weights && !isObjectEmpty(config.weights)) {
      const tableRows = document.querySelectorAll('table.summary:not([id]) tbody tr');
      tableRows.forEach((row,idx) => {
        if (idx === tableRows.length - 1) {
          return;
        }
        row.lastElementChild.textContent = config.weights[row.firstElementChild.textContent] + '%';
      });
    }
    if (config.use_weighting === undefined) {
      config.use_weighting = course.apply_assignment_group_weights || !isObjectEmpty(config.weights);
    }
    // Function for creating the body for the grading standard table (in the case of a reset, this function is used to rebuild the table)
    const loadGradingStandardTable = function(lowerBounds) {
      // Sort the lower bounds before constructing the table
      const grade_lower_bounds = Object.keys(lowerBounds).sort((a,b) => b-a);
      const tbody = document.createElement('tbody');
      let marker = 0;
      for (const grade of grade_lower_bounds) {
        // Create each row with a cell for the letter grade and the grade scales associated with the current letter grade
        // Also add buttons for row deletion (trash can) and adding new rules (plus icon)
        const tbody_row = document.createElement('tr');
        const tbody_letter_grade = document.createElement('th');
        const tbody_grade = document.createElement('td');
        const tbody_trash = document.createElement('td');
        const trash_button = document.createElement('a');
        const trash_icon = document.createElement('i');
        const add_above_button = document.createElement('a');
        const add_above_icon = document.createElement('i');
        tbody_letter_grade.scope = 'col';
        tbody_letter_grade.textContent = lowerBounds[grade];
        tbody_grade.dataset.lower_bound = grade;
        tbody_grade.scope = 'col';
        tbody_grade.textContent = marker === 0 ? `≥ ${grade}` : (marker === grade_lower_bounds.length - 1 ? `< ${[grade_lower_bounds[marker-1]]}` : `${grade_lower_bounds[marker-1]} < % ≤ ${grade}`);
        trash_icon.classList.add('fas', 'fa-trash');
        trash_button.href = 'javascript:void(0);';
        trash_button.style.color = 'firebrick';
        // Add event listener to the trash can button
        trash_button.addEventListener('click', e => deleteGradingStandardRow(e.target));
        tbody_trash.style.borderBottom = 0;
        tbody_trash.style.display = 'none';
        add_above_icon.classList.add('fas', 'fa-plus-circle');
        add_above_icon.style.backgroundColor = 'white';
        add_above_button.style.color = 'cornflowerblue';
        add_above_button.style.left = '-920%';
        add_above_button.style.position = 'relative';
        add_above_button.style.zIndex = 10;
        add_above_button.style.transform = 'translateY(-50%)';
        add_above_button.style.display = 'none';
        add_above_button.style.fontSize = '.85em';
        add_above_button.href = 'javascript:void(0);';
        add_above_button.classList.add('add_row');
        // Add event listener to the add row button
        add_above_button.addEventListener('click', e => addGradingStandardRow(e.target));
        trash_button.appendChild(trash_icon);
        tbody_trash.appendChild(trash_button);
        add_above_button.appendChild(add_above_icon);
        tbody_row.appendChild(tbody_letter_grade);
        tbody_row.appendChild(tbody_grade);
        tbody_row.appendChild(add_above_button);
        // If the current row is the last row, then include a add row button at the bottom (for adding a row below the current row)
        if (marker === grade_lower_bounds.length - 1) {
          const add_below_button = add_above_button.cloneNode(true);
          add_below_button.style.transform = 'translateY(100%)';
          add_below_button.id = 'add_below';
          // Add event listener to the newly cloned element (event listeners are not cloned)
          add_below_button.addEventListener('click', e => addGradingStandardRow(e.target));
          tbody_row.appendChild(add_below_button);
        }
        tbody_row.appendChild(tbody_trash);
        tbody.appendChild(tbody_row);
        marker++;
      }
      return tbody;
    }
    // Initialize the grading standards table (viewing mode with the lower limit being stored using a data-* attribute) [<elm>.dataset.lower_bound]
    const gradingStandardTable = document.createElement('table');
    const thead = document.createElement('thead');
    const thead_row = document.createElement('tr');
    const thead_letter_grade = document.createElement('th');
    const thead_grade = document.createElement('th');
    const thead_trash = document.createElement('th');
    thead_letter_grade.scope = 'col';
    thead_letter_grade.textContent = 'Letter Grade';
    thead_grade.scope = 'col';
    thead_grade.textContent = 'Grading Scales';
    thead_trash.style.borderBottom = 'none';
    thead_trash.style.width = 0;
    thead_row.appendChild(thead_letter_grade);
    thead_row.appendChild(thead_grade);
    thead_row.appendChild(thead_trash);
    thead.appendChild(thead_row);
    // Load the initial grading standard values (priority is the following: class config -> class grading standard -> global config -> hard-coded default)
    const tbody = loadGradingStandardTable(config.grading_standard ?? classGradingStandard ?? globalConfig.default_grading_standard ?? default_grading_standard);
    gradingStandardTable.appendChild(thead);
    gradingStandardTable.appendChild(tbody);
    // Initialize the assignment drops table
    // Clone thead for the grading standards table and modify it for the assignment drops table
    const dropsTable = document.createElement('table');
    const drops_thead = thead.cloneNode(true);
    drops_thead.firstElementChild.lastElementChild.remove();
    drops_thead.firstElementChild.firstElementChild.textContent = 'Group';
    drops_thead.firstElementChild.lastElementChild.textContent = 'Drops';
    const drops_tbody = document.createElement('tbody');
    for (const group of courseAssignments) {
      const tbody_row = document.createElement('tr'); 
      const tbody_group = document.createElement('th');
      const tbody_drops = document.createElement('td');
      // First try to get drops from config first, then try to get drops from the course rules, or else set the drops as 0
      // For each group, the drops format is an array of the following format: [# of low grades to drop, # of high grades to drop]
      const curr = config.drops?.[group.name] ?? [group.rules.drop_lowest ?? 0, group.rules.drop_highest ?? 0];
      tbody_group.scope = 'col';
      tbody_group.textContent = group.name;
      tbody_drops.scope = 'col';
      tbody_drops.textContent = `${curr[0]} low, ${curr[1]} high`;
      tbody_drops.dataset.low_drops = curr[0];
      tbody_drops.dataset.high_drops = curr[1];
      tbody_row.appendChild(tbody_group);
      tbody_row.appendChild(tbody_drops);
      drops_tbody.appendChild(tbody_row);
    }
    // Add the head and body to the table
    dropsTable.appendChild(drops_thead);
    dropsTable.appendChild(drops_tbody);

    const table = tableContainer.querySelector('table.summary');
    const tableHeader = tableContainer.querySelector('h2');
    // Get the checkbox for determine how grading is done for missing/ungraded assignments (clone the element to remove event listener)
    const tmpCheckbox = document.getElementById('only_consider_graded_assignments');
    tmpCheckbox.parentElement.replaceChild(tmpCheckbox.cloneNode(true), tmpCheckbox);
    const gradingAssignmentsCheckbox = document.getElementById('only_consider_graded_assignments');
    // What-If Scores button
    const showWhatIfScores = document.getElementById('student-grades-whatif').querySelector('button');
    // Revert to Actual Score button
    const hideWhatIfScores = document.getElementById('revert-all-to-actual-score');

    // set active state for table editing (initial state is not editing)
    window.editing = false;
    // If the config is using weighting or if the course has weighting, then set the edit mode to true
    window.editMode = config.use_weighting ?? course.apply_assignment_group_weights;
    window.gradingStandardViewMode = globalConfig.grading_standard_default_view;
    window.gradingStandardMode = null; // null, 'set', 'view'
    window.dropsViewMode = globalConfig.drops_default_view;
    window.dropsMode = null; // null, 'set', 'view'
    window.gradeStatisticsViewMode = globalConfig.class_statistics_default_view;

    // Create elements that are being added to the grades page
    const editTable = document.createElement('a');
    const saveWeightChanges = document.createElement('a');
    const weightConfig = document.createElement('a');
    const weightsErrorMessage = document.createElement('p');
    const resetWeightsContainer = document.createElement('div');
    const resetWeights = document.createElement('input'); // checkbox
    const resetWeightsLabel = document.createElement('label'); // checkbox label
    const setGradingStandard = document.createElement('a');
    const setDefaultGradingStandardContainer = document.createElement('div');
    const setDefaultGradingStandard = document.createElement('input'); // checkbox
    const setDefaultGradingStandardLabel = document.createElement('label'); // checkbox label
    const resetGradingStandardContainer = document.createElement('div');
    const resetGradingStandard = document.createElement('input'); // checkbox
    const resetGradingStandardLabel = document.createElement('label'); // checbox label
    const gradingStandardCheckboxes = document.createElement('div');
    const saveGradingStandard = document.createElement('a');
    const gradingStandardErrorMessage = document.createElement('p');
    const viewGradingStandard = document.createElement('a');
    const setDrops = document.createElement('a');
    const viewDrops = document.createElement('a');
    const saveDrops = document.createElement('a');
    const dropsErrorMessage = document.createElement('p');
    const resetDropsContainer = document.createElement('div');
    const resetDrops = document.createElement('input'); // checkbox
    const resetDropsLabel = document.createElement('label'); // checkbox label
    const hr = document.createElement('hr');

    // Configure all of the elements that were just created
    table.style.display = window.editMode ? 'inline-table' : 'none';
    tableHeader.textContent = window.editMode ? "Assignments are weighted by group:" : "Course assignments are not weighted."
    editTable.textContent = 'Edit grade weighting';
    editTable.href = 'javascript:void(0);';
    editTable.style.display = 'flex';
    editTable.style.width = 'fit-content';
    saveWeightChanges.textContent = 'Save changes';
    saveWeightChanges.href = 'javascript:void(0);';
    saveWeightChanges.style.display = 'none';
    saveWeightChanges.style.width = 'fit-content';
    weightConfig.href = 'javascript:void(0);';
    weightConfig.style.display = 'none';
    weightConfig.style.float = 'left';
    weightConfig.style.width = 'fit-content';
    weightConfig.textContent = !window.editMode ? "Use weighting for this course" : "Don't use weighting for this course";
    weightsErrorMessage.style.display = 'none';
    weightsErrorMessage.style.color = 'rgb(255,0,0)';
    weightsErrorMessage.style.margin = 0;
    weightsErrorMessage.style.width = 'fit-content';
    resetWeights.type = 'checkbox';
    resetWeights.id = 'reset_weights';
    resetWeights.style.marginRight = '5px';
    resetWeights.style.marginBottom = '-2px';
    resetWeightsLabel.htmlFor = 'reset_weights';
    resetWeightsLabel.textContent = 'Reset weights?';
    resetWeightsLabel.style.userSelect = 'none';
    resetWeightsContainer.style.display = 'none';
    setGradingStandard.style.display = 'flex';
    setGradingStandard.style.width = 'fit-content';
    setGradingStandard.href = 'javascript:void(0);';
    setGradingStandard.textContent = 'Edit grading standard';
    setDefaultGradingStandard.type = 'checkbox';
    setDefaultGradingStandard.id = 'set_default_grading_standard';
    setDefaultGradingStandard.style.marginRight = '5px';
    setDefaultGradingStandard.style.marginBottom = '-2px';
    setDefaultGradingStandardLabel.htmlFor = 'set_default_grading_standard';
    setDefaultGradingStandardLabel.textContent = 'Set as default?';
    setDefaultGradingStandardLabel.style.userSelect = 'none';
    setDefaultGradingStandardContainer.style.display = 'inline';
    resetGradingStandard.type = 'checkbox';
    resetGradingStandard.id = 'reset_grading_standard';
    resetGradingStandard.style.marginRight = '5px';
    resetGradingStandard.style.marginBottom = '-2px';
    resetGradingStandardLabel.htmlFor = 'reset_grading_standard';
    resetGradingStandardLabel.textContent = 'Reset to default?';
    resetGradingStandardLabel.style.userSelect = 'none';
    resetGradingStandardContainer.style.display = 'inline';
    resetGradingStandardContainer.style.marginLeft = '8px';
    gradingStandardCheckboxes.style.display = 'none';
    saveGradingStandard.style.display = 'none';
    saveGradingStandard.style.width = 'fit-content';
    saveGradingStandard.href = 'javascript:void(0);';
    saveGradingStandard.textContent = 'Save changes';
    viewGradingStandard.style.display = 'flex';
    viewGradingStandard.style.width = 'fit-content';
    viewGradingStandard.href = 'javascript:void(0);';
    viewGradingStandard.textContent = window.gradingStandardViewMode ? 'Hide grading standard' : 'Show grading standard';
    gradingStandardErrorMessage.style.display = 'none';
    gradingStandardErrorMessage.style.color = 'rgb(255,0,0)';
    gradingStandardErrorMessage.style.margin = 0;
    gradingStandardErrorMessage.style.width = 'fit-content';
    gradingStandardTable.style.display = window.gradingStandardViewMode ? 'inline-table' : 'none';
    gradingStandardTable.id = 'grading_standard';
    gradingStandardTable.classList.add('summary');
    gradingStandardTable.style.width = '96%';
    gradingStandardTable.style.fontSize = '93%';
    dropsTable.id = 'drops_table';
    dropsTable.classList.add('summary');
    dropsTable.style.width = '96%';
    dropsTable.style.fontSize = '90%';
    dropsTable.style.display = window.dropsViewMode ? 'inline-table' : 'none';
    setDrops.href = 'javascript:void(0);';
    setDrops.style.display = 'flex';
    setDrops.style.width = 'fit-content';
    setDrops.textContent = 'Edit assignment drop rules';
    saveDrops.style.display = 'none';
    saveDrops.style.width = 'fit-content';
    saveDrops.href = 'javascript:void(0);';
    saveDrops.textContent = 'Save changes';
    viewDrops.style.display = 'flex';
    viewDrops.style.width = 'fit-content';
    viewDrops.href = 'javascript:void(0);';
    viewDrops.textContent = window.dropsViewMode ? 'Hide drop rules' : 'Show drop rules';
    dropsErrorMessage.style.display = 'none';
    dropsErrorMessage.style.color = 'rgb(255,0,0)';
    dropsErrorMessage.style.margin = 0;
    dropsErrorMessage.style.width = 'fit-content';
    resetDrops.type = 'checkbox';
    resetDrops.id = 'reset_drops';
    resetDrops.style.marginRight = '5px';
    resetDrops.style.marginBottom = '-2px';
    resetDropsLabel.htmlFor = 'reset_drops';
    resetDropsLabel.textContent = 'Reset drops?';
    resetDropsLabel.style.userSelect = 'none';
    resetDropsContainer.style.display = 'none';
    hr.style.margin = '10px 0';

    // Add elements to the page (all elements are added below the weighting table)
    tableContainer.appendChild(weightsErrorMessage);
    tableContainer.appendChild(editTable);
    tableContainer.appendChild(weightConfig);
    resetWeightsContainer.appendChild(resetWeights);
    resetWeightsContainer.appendChild(resetWeightsLabel);
    tableContainer.appendChild(resetWeightsContainer);
    tableContainer.appendChild(saveWeightChanges);
    tableContainer.appendChild(hr);
    tableContainer.appendChild(dropsTable);
    tableContainer.appendChild(dropsErrorMessage);
    tableContainer.appendChild(setDrops);
    resetDropsContainer.appendChild(resetDrops);
    resetDropsContainer.appendChild(resetDropsLabel);
    tableContainer.appendChild(resetDropsContainer);
    tableContainer.appendChild(saveDrops);
    tableContainer.appendChild(viewDrops);
    tableContainer.appendChild(hr.cloneNode(false));
    tableContainer.appendChild(gradingStandardTable);
    tableContainer.appendChild(gradingStandardErrorMessage);
    tableContainer.appendChild(setGradingStandard);
    setDefaultGradingStandardContainer.appendChild(setDefaultGradingStandard);
    setDefaultGradingStandardContainer.appendChild(setDefaultGradingStandardLabel);
    resetGradingStandardContainer.appendChild(resetGradingStandard);
    resetGradingStandardContainer.appendChild(resetGradingStandardLabel);
    gradingStandardCheckboxes.appendChild(setDefaultGradingStandardContainer);
    gradingStandardCheckboxes.appendChild(resetGradingStandardContainer);
    tableContainer.appendChild(gradingStandardCheckboxes);
    tableContainer.appendChild(saveGradingStandard);
    tableContainer.appendChild(viewGradingStandard);
    // Event listener for editing the class weights table
    editTable.addEventListener('click', () => {
      if (window.editing !== false) {
        return;
      }
      // Get all of the weight cells
      const weightCells = table.querySelectorAll('tbody td');
      // Check if the cells are currently using inputs (instead of just text)
      const inputMode = weightCells[0].firstElementChild !== null;
      resetWeights.checked = false;
      weightCells.forEach((weight,idx) => {
        if (idx === weightCells.length - 1) {
          return;
        }
        // Create a input for configuring the weight for the current assignment group
        const weightInput = document.createElement('input');
        weightInput.type = 'text';
        weightInput.placeholder = '0-100';
        weightInput.spellcheck = false;
        weightInput.autocomplete = false;
        weightInput.maxLength = 6;
        weightInput.value = inputMode ? weight.firstElementChild.value : weight.textContent.slice(0,-1);
        weightInput.style.marginBottom = 0;
        weightInput.style.width = '6em';
        // Clear the text content so that the input is the only element in the current weight cell
        weight.textContent = '';
        weight.appendChild(weightInput);
      });
      editTable.style.display = 'none';
      weightConfig.style.display = 'flex';
      saveWeightChanges.style.display = 'flex';
      resetWeightsContainer.style.display = 'inline-block';
      window.editing = true;
    });
    saveWeightChanges.addEventListener('click', async () => {
      if (window.editing !== true) {
        return;
      }
      // Check if the weighting is being reset (do this first as it has priority over any other action)
      // If weights were not being used originally, then use the same state as no weighting
      // Or else get the weights for all assignment groups and update the table
      if (resetWeights.checked && !course.apply_assignment_group_weights) {
        table.style.display = 'none';
        weightConfig.textContent = "Use weighting for this course";
        tableHeader.textContent = "Course assignments are not weighted.";
        weightsErrorMessage.style.display = 'none';
        saveWeightChanges.style.display = 'none';
        weightConfig.style.display = 'none';
        editTable.style.display = 'flex';
        resetWeightsContainer.style.display = 'none';
        window.editMode = false;
        window.editing = false;
        config.use_weighting = false;
        await saveConfig(config, courseID);
        await updateGradeDisplay(null);
        return;
      } else if (resetWeights.checked) {
        // Get the weights for each group
        const groupWeights = {};
        for (const group of courseAssignments) {
          groupWeights[group.name] = group.group_weight;
        }
        // Update the rows of the weights table using the weights that were just placed into a dictionary
        const weightRows = document.querySelectorAll('table.summary:not([id]) tbody tr:not(:last-child)');
        for (const row of weightRows) {
          const gradeCell = row.lastElementChild;
          // Remove input
          gradeCell.replaceChildren();
          gradeCell.textContent = groupWeights[row.firstElementChild.textContent] + '%';
        }
        weightsErrorMessage.style.display = 'none';
        saveWeightChanges.style.display = 'none';
        weightConfig.style.display = 'none';
        editTable.style.display = 'flex';
        resetWeightsContainer.style.display = 'none';
        window.editing = false;
        config.weights = groupWeights;
        config.use_weighting = true;
        await saveConfig(config, courseID);
        await updateGradeDisplay(null);
        return;
      }
      // Check if no weighting mode is toggled
      // If so, then save that rule and do not save anything else
      if (!window.editMode) {
        weightsErrorMessage.style.display = 'none';
        saveWeightChanges.style.display = 'none';
        weightConfig.style.display = 'none';
        editTable.style.display = 'flex';
        tableHeader.textContent = "Course assignments are not weighted.";
        resetWeightsContainer.style.display = 'none';
        window.editing = false;
        config.use_weighting = false;
        await saveConfig(config, courseID);
        await updateGradeDisplay(null);
        return;
      }
      const weightInputs = table.querySelectorAll('table.summary:not([id]) tbody input');
      if (weightInputs.length === 0) {
        console.error('Unexpected behavior. No inputs were found');
        return;
      }
      // Perform validation of the inputs and reveal error message if the input is bad
      const values = {};
      let weightSum = 0;
      for (const input of weightInputs) {
        const weight = +input.value;
        // Check for non-numerical or negative weights
        if (isNaN(weight) || weight < 0) {
          weightsErrorMessage.style.dsiplay = 'flex';
          weightsErrorMessage.textContent = "Please use non-negative numerical values for the weights";
        }
        weightSum += weight;
        values[input.parentElement.previousElementSibling.textContent] = weight;
      }
      // Reveal an error message if the weights don't add up to 100
      if (weightSum !== 100) {
        weightsErrorMessage.style.display = 'flex';
        weightsErrorMessage.textContent = "Please make sure that the weights you provided add up to 100";
        return;
      }
      // Configure each of the weighting table cells 
      for (const input of weightInputs) {
        const tableCell = input.parentElement;
        tableCell.textContent = values[tableCell.previousElementSibling.textContent] + '%';
      }
      // Hide error message on success
      weightsErrorMessage.style.display = 'none';
      saveWeightChanges.style.display = 'none';
      weightConfig.style.display = 'none';
      editTable.style.display = 'flex';
      resetWeightsContainer.style.display = 'none';
      window.editing = false;
      config.weights = values;
      config.use_weighting = true;
      // Save config and update the grade display
      await saveConfig(config, courseID);
      // TODO Consider changing this so that only the weights have to be recalculated (store assignment group calculations in a window variable)
      await updateGradeDisplay(null);
    });
    weightConfig.addEventListener('click', () => {
      if (window.editing !== true) {
        return;
      }
      // If weighting is currently being used, then disable it
      // Or else enable weighting (if it is disabled)
      if (window.editMode) {
        table.style.display = 'none';
        weightConfig.textContent = "Use weighting for this course";
        tableHeader.textContent = "Course assignments are not weighted.";
      } else {
        table.style.display = 'inline-table'; // Revert to original display style
        weightConfig.textContent = "Don't use weighting for this course";
        tableHeader.textContent = "Assignments are weighted by group:";
      }
      window.editMode = !window.editMode;
      weightsErrorMessage.style.display = 'none';
    });
    setGradingStandard.addEventListener('click', () => {
      // 'view' or null is acceptable
      if (window.gradingStandardMode === 'set') {
        return;
      }      
      const gradingStandardRows = document.querySelectorAll('#grading_standard tbody tr');
      // Check if the table was previously in editing mode (check if there is an input element)
      const inputMode = gradingStandardRows[0].firstElementChild.firstElementChild !== null;
      // Reset grading standard checkboxes
      setDefaultGradingStandard.checked = false;
      resetGradingStandard.checked = false;
      // Nothing to do if the table is already using inputs (table cells do not need to be modified)
      if (inputMode) {
        gradingStandardTable.style.display = 'inline-table';
        setGradingStandard.style.display = 'none';
        saveGradingStandard.style.display = 'flex';
        gradingStandardCheckboxes.style.display = 'inline-block';
        viewGradingStandard.style.display = 'none';
        window.gradingStandardMode = 'set';
        return;
      }
      for (const row of gradingStandardRows) {
        // Get the cell for the letter grade and the lower grade threshold
        const letterGradeCell = row.firstElementChild;
        const lowerGradeThresholdCell = row.children[1];
        const trashCell = row.lastElementChild;
        const addButtonAbove = row.children[2];
        const addButtonBelow = row.nextElementSibling === null ? row.children[3] : null; 
        const letterGradeInput = document.createElement('input');
        const gradeInput = document.createElement('input');        
        // Configure input attributes
        letterGradeInput.type = 'text';
        letterGradeInput.placeholder = '';
        letterGradeInput.spellcheck = false;
        letterGradeInput.autocomplete = false;
        letterGradeInput.maxLength = 2;
        letterGradeInput.style.width = '60%';
        letterGradeInput.style.marginBottom = 0;
        letterGradeInput.value = letterGradeCell.textContent;
        letterGradeCell.textContent = '';
        gradeInput.type = 'text';
        gradeInput.placeholder = '0-100';
        gradeInput.spellcheck = false;
        gradeInput.autocomplete = false;
        gradeInput.maxLength = 5; // allow for numbers with decimals (e.g 93.5 or 97.25)
        gradeInput.style.width = '75%';    
        gradeInput.style.marginBottom = 0;
        gradeInput.value = lowerGradeThresholdCell.dataset.lower_bound;
        lowerGradeThresholdCell.textContent = '';
        // Show the delete row and add row buttons 
        trashCell.style.display = '';
        addButtonAbove.style.display = 'inline-block';
        // If the current row is the last row, we also need to show the add row below button
        if (addButtonBelow !== null) {
          addButtonBelow.style.display = 'inline-block';
        }
        // Add the inputs to each of the cells of the grading standard table
        letterGradeCell.appendChild(letterGradeInput);
        lowerGradeThresholdCell.appendChild(gradeInput);
      }
      // Update the table header for the 
      gradingStandardTable.firstElementChild.firstElementChild.children[1].textContent = 'Lower Grade Threshold (%)';
      gradingStandardTable.style.display = 'inline-table';
      setGradingStandard.style.display = 'none';
      saveGradingStandard.style.display = 'flex';
      gradingStandardCheckboxes.style.display = 'inline-block';
      viewGradingStandard.style.display = 'none';
      window.gradingStandardMode = 'set';
    });
    saveGradingStandard.addEventListener('click', async () => {
      // only 'set' is acceptable
      if (window.gradingStandardMode !== 'set') {
        return;
      }
      // Check if reset grading standard button is checked
      // If so, then remove the table body and regenerate it
      if (resetGradingStandard.checked) {
        gradingStandardTable.querySelector('tbody').remove();
        const fallbackGradingStandard = classGradingStandard ?? globalConfig.default_grading_standard ?? default_grading_standard;
        gradingStandardTable.appendChild(loadGradingStandardTable(fallbackGradingStandard));
        // Perform additional updates before saving
        gradingStandardErrorMessage.textContent = '';
        saveGradingStandard.style.display = 'none';
        gradingStandardCheckboxes.style.display = 'none';
        gradingStandardErrorMessage.style.display = 'none';
        gradingStandardTable.style.display = 'none';
        setGradingStandard.style.display = 'flex';
        viewGradingStandard.style.display = 'flex';
        gradingStandardTable.firstElementChild.firstElementChild.children[1].textContent = 'Grading Scales';
        window.gradingStandardMode = null;
        // If the grading standard was being viewed before editing, then show the grading standard table  
        gradingStandardTable.style.display = window.gradingStandardViewMode ? 'inline-table' : 'none'; 
        // Update the config then save
        config.grading_standard = fallbackGradingStandard;
        await saveConfig(config, courseID);
        // Update letter grade for the grade display (no grade recalculations required - percentages are stored in window.courseGrades as an array [you, q1, q2, q3, mean])
        await updateGradeDisplay(window.courseGrades);
        return;
      }
      // First check if the data provided by the inputs is valid
      const grading_standard = {}; // key: grade, value: letter grade
      const gradingStandardRows = document.querySelectorAll('#grading_standard tbody tr');
      const letterGrades = new Set();
      for (const row of gradingStandardRows) {
        const letterGrade = row.firstElementChild.firstElementChild.value;
        const lowerGradeThreshold = +row.children[1].firstElementChild.value;
        if (letterGrade.trim() === '') {
          gradingStandardErrorMessage.textContent = "Please don't leave the input for the letter grade blank";
          gradingStandardErrorMessage.style.display = 'flex';
          return;
        }
        if (isNaN(lowerGradeThreshold) || lowerGradeThreshold < 0) {
          gradingStandardErrorMessage.textContent = "Please use non-negative numerical values for the lower grade threshold";
          gradingStandardErrorMessage.style.display = 'flex';
          return;
        }
        if (grading_standard[lowerGradeThreshold]) {
          gradingStandardErrorMessage.textContent = "Please don't use duplicate values for the lower grade threshold";
          gradingStandardErrorMessage.style.display = 'flex';
          return;
        }
        if (letterGrades.has(letterGrade)) {
          gradingStandardErrorMessage.textContent = "Please don't use duplicate values for the letter grade";
          gradingStandardErrorMessage.style.display = 'flex';
          return;
        }
        grading_standard[lowerGradeThreshold] = letterGrade;
        letterGrades.add(letterGrade);
      }
      // If the input is valid, then configure the cells
      for (const row of gradingStandardRows) {
        const gradeCell = row.children[1];
        gradeCell.dataset.lower_bound = gradeCell.firstElementChild.value;
      }
      gradingStandardErrorMessage.textContent = '';
      saveGradingStandard.style.display = 'none';
      gradingStandardCheckboxes.style.display = 'none';
      gradingStandardErrorMessage.style.display = 'none';
      gradingStandardTable.style.display = 'none';
      setGradingStandard.style.display = 'flex';
      viewGradingStandard.style.display = 'flex';
      gradingStandardTable.firstElementChild.firstElementChild.children[1].textContent = 'Grading Scales';
      window.gradingStandardMode = null;
      // If the grading standard was being viewed before editing, then show the grading standard table
      if (window.gradingStandardViewMode) {
        toggleGradingStandardTable();
      }
      config.grading_standard = grading_standard;
      await saveConfig(config, courseID);
      if (setDefaultGradingStandard.checked) {
        await saveConfig({ default_grading_standard: grading_standard }, null);
      }
      // Update letter grade for the grade display (no grade recalculations required - percentages are stored in window.courseGrades as an array [you, q1, q2, q3, mean])
      await updateGradeDisplay(window.courseGrades);
    });
    // Function for toggling the view of the grading standard table
    const toggleGradingStandardTable = function() {
      // Any state of window.gradingStandardMode is acceptable
      const gradingStandardRows = Array.from(document.querySelectorAll('#grading_standard tbody tr'));
      const gradingStandardBody = gradingStandardRows[0].parentElement;
      // Check if the table was previously in editing mode (check if there is an input element)
      const inputMode = gradingStandardRows[0].firstElementChild.firstElementChild !== null;
      // Nothing to do if the table does not use inputs already  
      if (!inputMode) {
        viewGradingStandard.textContent = window.gradingStandardViewMode ? 'Show grading standard' : 'Hide grading standard';
        gradingStandardTable.style.display = window.gradingStandardViewMode ? 'none' : 'inline-table';
        window.gradingStandardMode = window.gradingStandardViewMode ? 'view' : null;
        window.gradingStandardViewMode = !window.gradingStandardViewMode;
        setGradingStandard.style.display = 'flex';
        saveGradingStandard.style.display = 'none';
        return;
      }
      // Sort rows in descending order of grade
      gradingStandardRows.sort((a,b) => b.children[1].firstElementChild.value - a.children[1].firstElementChild.value);
      // Re-append rows (since the elements are already in the DOM, they will be moved to their new location (this will sort the rows in descending )
      // Reference: https://developer.mozilla.org/en-US/docs/Web/API/Node/appendChild#sect1
      for (const row of gradingStandardRows) {
        gradingStandardBody.appendChild(row);
      }
      let marker = 0;
      for (const row of gradingStandardRows) {
        // Access all important elements in the current row
        const letterGradeCell = row.firstElementChild;
        const lowerGradeThresholdCell = row.children[1];
        const trashCell = row.lastElementChild;
        const addRow = row.children[2];
        const letterGrade = letterGradeCell.firstElementChild.value;
        const lowerGradeThreshold = +lowerGradeThresholdCell.dataset.lower_bound;
        // Replace the inputs from the table cells with text
        // First remove the inputs from both cells in the current row
        letterGradeCell.replaceChildren();
        lowerGradeThresholdCell.replaceChildren();
        // Replace the inputs in the cells with text
        letterGradeCell.textContent = letterGrade;
        lowerGradeThresholdCell.textContent = marker === 0 ? `≥ ${lowerGradeThreshold}` : ((marker === gradingStandardRows.length - 1 && lowerGradeThreshold === 0) ? `< ${gradingStandardRows[marker-1].children[1].dataset.lower_bound}` : `${gradingStandardRows[marker-1].children[1].dataset.lower_bound} < % ≤ ${lowerGradeThreshold}`);
        trashCell.style.display = 'none';
        addRow.style.display = 'none';
        marker++;
      }
      // Hide the add below button
      document.getElementById('add_below').style.display = 'none';
      window.gradingStandardMode = 'view';
      viewGradingStandard.textContent = 'Hide grading standard';
      gradingStandardTable.style.display = 'inline-table';
      viewGradingStandard.style.display = 'flex';
      window.gradingStandardViewMode = true;
    }
    viewGradingStandard.addEventListener('click', toggleGradingStandardTable);
    resetGradingStandard.addEventListener('change', () => {
      // If the reset grading standard checkbox is ticked, then disable the default grading standard checkbox
      if (resetGradingStandard.checked) {
        setDefaultGradingStandard.checked = false;
        setDefaultGradingStandard.disabled = true;
      } else {
        setDefaultGradingStandard.disabled = false;
      }
    });
    setDefaultGradingStandard.addEventListener('change', () => {
      // If the default grading standard checkbox is ticked, then disable the reset graidng standard checkbox
      if (setDefaultGradingStandard.checked) {
        resetGradingStandard.checked = false;
        resetGradingStandard.disabled = true;
      } else {
        resetGradingStandard.disabled = false;
      }
    });
    setDrops.addEventListener('click', () => {
      if (window.dropsMode === 'set') {
        return;
      }
      const dropsRows = document.querySelectorAll('#drops_table tbody tr');
      // Check if the table was previously in editing mode (check if there is an input element)
      const inputMode = dropsRows[0].lastElementChild.firstElementChild !== null;
      resetDrops.checked = false;
      // Nothing to do if the table is already using inputs
      if (inputMode) {
        dropsTable.style.display = 'inline-table';
        setDrops.style.display = 'none';
        saveDrops.style.display = 'flex';
        viewDrops.style.dispaly = 'none';
        resetDropsContainer.style.display = 'inline';
        window.dropsMode = 'set';
        return;
      }
      let marker = 0;
      for (const row of dropsRows) {
        const dropsCell = row.lastElementChild;
        // Create input elements with labels
        const lowDropsInput = document.createElement('input');
        const lowDropsLabel = document.createElement('label');
        const highDropsInput = document.createElement('input');
        const highDropsLabel = document.createElement('label');
        const inputsContainer = document.createElement('div');
        // Configure attributes of the newly created elements
        lowDropsInput.type = 'text';
        lowDropsInput.placeholder = '0-99';
        lowDropsInput.spellcheck = false;
        lowDropsInput.autocomplete = false;
        lowDropsInput.maxLength = 2;
        lowDropsInput.style.width = '15%';
        lowDropsInput.style.marginBottom = 0;
        lowDropsInput.style.marginRight= '10px';
        lowDropsInput.value = +dropsCell.dataset.low_drops;
        lowDropsInput.id = 'low_drops_input_' + marker;
        highDropsInput.type = 'text';
        highDropsInput.placeholder = '0-99';
        highDropsInput.spellcheck = false;
        highDropsInput.autocomplete = false;
        highDropsInput.maxLength = 2;
        highDropsInput.style.width = '15%';
        highDropsInput.style.marginBottom = 0;
        highDropsInput.value = +dropsCell.dataset.high_drops;
        highDropsInput.id = 'high_drops_input_' + marker;
        inputsContainer.style.marginBottom = '10px';
        lowDropsLabel.htmlFor = 'low_drops_input_' + marker;
        lowDropsLabel.textContent = 'Low';
        lowDropsLabel.style.position = 'absolute';
        lowDropsLabel.style.transform = 'translate(5px,37px)';
        lowDropsLabel.style.fontSize = '85%';
        lowDropsLabel.style.color = 'gray';
        highDropsLabel.htmlFor = 'high_drops_input_' + marker;
        highDropsLabel.textContent = 'High';
        highDropsLabel.style.position = 'absolute';
        highDropsLabel.style.transform = 'translate(55px,37px)';
        highDropsLabel.style.fontSize = '85%';
        highDropsLabel.style.color = 'gray';
        // Clear text in the drops cell (text is being replaced with a text input)
        dropsCell.textContent = '';
        // Add newly created elements to the current row in the drops table
        dropsCell.appendChild(lowDropsLabel);
        dropsCell.appendChild(highDropsLabel);
        inputsContainer.appendChild(lowDropsInput);
        inputsContainer.appendChild(highDropsInput);
        dropsCell.appendChild(inputsContainer);
        marker++;
      }
      // Show the table after configuring it for input mode
      dropsTable.style.display = 'inline-table';
      setDrops.style.display = 'none';
      saveDrops.style.display = 'flex';
      viewDrops.style.display = 'none';
      resetDropsContainer.style.display = 'inline';
      window.dropsMode = 'set';
    });
    saveDrops.addEventListener('click', async () => {
      if (window.dropsMode !== 'set') {
        return;
      }
      const defaultMap = {};
      // If the reset drops checkbox is ticked, then use the drop counts from the class rules, or else use 0 if the class rule is not present
      if (resetDrops.checked) {
        for (const group of courseAssignments) {
          defaultMap[group.name] = [group.rules.drop_lowest ?? 0, group.rules.drop_highest ?? 0];
        }
      }
      const dropRules = {};
      const dropsRows = document.querySelectorAll('#drops_table tbody tr');
      let marker = 0;
      for (const row of dropsRows) {
        const groupName = row.firstElementChild.textContent;
        // If reset drops is set, then upate the input value to the count provided by the class rules, or 0 if there isn't a given value 
        if (resetDrops.checked) {
          row.lastElementChild.lastElementChild.firstElementChild.value = defaultMap[groupName][0];
          row.lastElementChild.lastElementChild.lastElementChild.value = defaultMap[groupName][1];
        }
        // Read value from the input and perform validation before adding the value to the drop rules map
        const lowDrops = +row.lastElementChild.lastElementChild.firstElementChild.value;
        const highDrops = +row.lastElementChild.lastElementChild.lastElementChild.value;
        // Display error message if any of the inputs contain a "bad" value
        if (isNaN(lowDrops) || isNaN(highDrops) || lowDrops < 0 || highDrops < 0 || lowDrops % 1 !== 0 || highDrops % 1 !== 0) {
          dropsErrorMessage.textContent = "Please use whole non-negative numerical values for the low/high drop count";
          dropsErrorMessage.style.display = 'flex';
          return;
        }
        dropRules[groupName] = [lowDrops, highDrops];
        marker++;
      }
      dropsErrorMessage.textContent = '';
      dropsErrorMessage.style.display = 'none';
      dropsTable.style.display = 'none';
      viewDrops.style.display = 'flex';
      saveDrops.style.display = 'none';
      setDrops.style.display = 'flex';
      resetDropsContainer.style.display = 'none';
      window.dropsMode = null;
      // If the drops table was original being viewed before editing, then re-display the drops table
      if (window.dropsViewMode) {
        toggleDropsTable();
      }
      // Modify config before saving the config to storage and updating the grade display
      config.drops = dropRules;
      await saveConfig(config, courseID);
      await updateGradeDisplay(null);
    });
    const toggleDropsTable = function() {
      const dropsRows = Array.from(document.querySelectorAll('#drops_table tbody tr'));
      const inputMode = dropsRows[0].lastElementChild.firstElementChild !== null;
      // Nothing to do if the table does not contain any inputs
      if (!inputMode) {
        viewDrops.textContent = window.dropsViewMode ? 'Show drop rules' : 'Hide drop rules';
        dropsTable.style.display = window.dropsViewMode ? 'none' : 'inline-table';
        window.dropsMode = window.dropsViewMode ? 'view' : null;
        window.dropsViewMode = !window.dropsViewMode;
        setDrops.style.display = 'flex';
        saveDrops.style.display = 'none';
        return;
      }
      for (const row of dropsRows) {
        const dropsCell = row.lastElementChild;
        const lowDrops = +dropsCell.lastElementChild.firstElementChild.value;
        const highDrops = dropsCell.lastElementChild.lastElementChild.value;
        // Replace the inputs in the drops cell with text
        dropsCell.replaceChildren();
        dropsCell.textContent = `${lowDrops} low, ${highDrops} high`;
        // Set the values in the dataset
        dropsCell.dataset.low_drops = lowDrops;
        dropsCell.dataset.high_drops = highDrops; 
      }
      window.dropsMode = 'view';
      viewDrops.textContent = 'Hide drop rules';
      dropsTable.style.display = 'inline-table';
      viewDrops.style.display = 'flex';
      window.dropsViewMode = true;
    }
    viewDrops.addEventListener('click', toggleDropsTable);
    gradingAssignmentsCheckbox.addEventListener('change', async () => await updateGradeDisplay(null));
    showWhatIfScores.addEventListener('click', async () => {
      // Fetch grades using GraphQL API
      const whatIfScores = (await (await (fetch('/api/graphql', {
        headers: {
          "content-type": "application/json",
           // Retrieve token required to make a request from the API (token is stored in the user's cookies)
          "x-csrf-token": decodeURIComponent((/(^|;) *_csrf_token=([^;]*)/.exec(document.cookie) || '')[2]),
        },
        // GraphQL query
        body: `{"query":"query whatIfGrades($courseId: ID!, $studentId: [ID!]) {\\n  course(id: $courseId) {\\n    submissionsConnection(studentIds: $studentId) {\\n      nodes {\\n        assignment {\\n          _id\\n       }\\n        score\\n        studentEnteredScore\\n      }\\n    }\\n  }\\n}","variables":{"courseId":${courseID},"studentId":[]},"operationName":"whatIfGrades"}`,
        method: "POST",
      }))).json()).data.course.submissionsConnection.nodes;
      // Store the What-If grades that are available in a dictionary
      const whatIfScoresDict = {};
      for (const scoreObj of whatIfScores) {
        const whatIfScore = scoreObj.studentEnteredScore ?? null;
        if (whatIfScore === null || whatIfScore === scoreObj.score) {
          continue; 
        }
        whatIfScoresDict[scoreObj.assignment._id] = whatIfScore;
      }
      if (isObjectEmpty(whatIfScoresDict)) {
        showWhatIfScores.style.display = 'none';
        return;
      }
      // Toggle the state of the what-if grades buttons (fixes Canvas bug)
      showWhatIfScores.parentElement.style.display = 'none';
      hideWhatIfScores.parentElement.style.display = 'block';
      // Update grades using the what-if grades (if there are any)
      await updateGradeDisplay(null, whatIfScoresDict);
    });
    hideWhatIfScores.addEventListener('click', async () => {
      // Revert to original scores (use values stored in window.courseGrades)
      showWhatIfScores.parentElement.style.display = 'block';
      hideWhatIfScores.parentElement.style.display = 'none';
      // Update grades using normal grade calculation 
      // TODO Consider storing the original data so that you can easily revert back
      await updateGradeDisplay(null);
    });
    // Mutation observer for checking if any assignment grades are changed (checking for the removal of a text input that is used to set a what-if grade)
    const observer = new MutationObserver((mutationList, _observer) => {
      for (const mutation of mutationList) {
        if (mutation.removedNodes && mutation.removedNodes.length === 1 && mutation.removedNodes[0].id === 'grade_entry') {
          updateGradeDisplay(null, 'DOM');
          break;
        }
      }
    });
    // Apply the mutation observer to all of the assignment grade cells
    const assignmentGradeCells = document.getElementById('grades_summary').querySelectorAll('tbody tr:not(.hard_coded) span.grade');
    for (const assignment of assignmentGradeCells) {
      observer.observe(assignment, {
        childList: true
      });
    }
    const deleteGradingStandardRow = function(elm) {
      // Iterate up the DOM tree to get the current row of the trash button
      while (elm !== null && elm.tagName !== 'TR') {
        elm = elm.parentElement;
      }
      // Throw an error if the row was never found (this shouldn't happen)
      if (elm === null) {
        throw new Error('Something unexpected happened when attempting to delete a row from the grading standard table');
      }
      // Delete current row ('element') from the grade standards table
      const rowCount = gradingStandardTable.lastElementChild.childElementCount;
      // Don't delete if the number of rows in the table is 2 or less 
      if (rowCount <= 2) {
        return;
      }
      // If the number of rows is 3, then hide all of the trash can icons (functionality will also be disabled by the conditional above)
      if (rowCount === 3) {
        gradingStandardTable.querySelectorAll('tbody td:last-child').forEach(trashCell => {
          trashCell.style.visibility = 'hidden';
        });
      } else if (rowCount === 18) {
        // Re-display the add button is the count is 18 (allow the user to add rows again)
        gradingStandardTable.querySelectorAll('tbody .add_row').forEach(addButton => {
          addButton.style.display = 'inline-block';
        });
      }
      // Check if the current row is the last row (the add below button is in the last row so this case is important)
      const specialCase = elm.nextElementSibling === null;
      if (specialCase) {
        // Move the add bottom button to the previous row
        const prev = elm.previousElementSibling;
        const addBelowButton = document.getElementById('add_below');
        prev.querySelector('.add_row').insertAdjacentElement('afterend', addBelowButton);
      }
      // Remove the current row
      elm.remove();
    }
    const addGradingStandardRow = function(elm) {
      let addRowButton = null;
      // Iterate up the DOM tree to get the current row of the add button
      while (elm !== null && elm.tagName !== 'TR') {
        // Get the add row button when you pass by it during iteration
        if (elm.tagName === 'A') {
          addRowButton = elm; 
        }
        elm = elm.parentElement;
      }
      // Throw an error if the row or add button was never found (this shouldn't happen)
      if (elm === null || addRowButton === null) {
        throw new Error('Something unexpected happened when attempting to add a row to the grading standard table');
      }
      const rowCount = gradingStandardTable.lastElementChild.childElementCount;
      // Don't add another row if the number of rows in the table is 18 or more 
      if (rowCount >= 18) {
        return;
      }
      // If the number of rows is 17, then hide all of the add row buttons (functionally will also be disabled by the conditional above)
      if (rowCount === 17) {
        gradingStandardTable.querySelectorAll('tbody .add_row').forEach(addButton => {
          addButton.style.display = 'none';
        });
      } else if (rowCount === 2) {
        // Unhide all buttons for deleting a row
        gradingStandardTable.querySelectorAll('tbody td:last-child').forEach(trashCell => {
          trashCell.style.visibility = 'visible';
        });
      }
      // Check for the special case (new row is being added using the add below button)
      const specialCase = addRowButton.id === 'add_below';
      // Check if the current row is the last row
      const isLastRow = elm.nextElementSibling === null; 
      // Clone the current row
      const newRow = elm.cloneNode(true);
      // If the special case applies, then strip the add row below button of its unique id, and give it to the add row below button in the newly cloned row
      if (specialCase) {
        addRowButton.id = '';
        const newRowAddButton = newRow.children[3];
        newRowAddButton.id = 'add_below';
        newRowAddButton.addEventListener('click', e => addGradingStandardRow(e.target));
        addRowButton.remove();
      }
      // If the row that contains the add row button is the last row (but the button is not add row below)
      if (isLastRow && !specialCase) {
        newRow.querySelector('#add_below').remove();
      }
      // Add event listener to the newly cloned element since event listeners are not copied 
      // Source: https://developer.mozilla.org/en-US/docs/Web/API/Node/cloneNode
      newRow.firstElementChild.firstElementChild.value = '';
      newRow.children[1].firstElementChild.value = '';
      newRow.children[2].addEventListener('click', e => addGradingStandardRow(e.target));
      newRow.lastElementChild.addEventListener('click', e => deleteGradingStandardRow(e.target));
      elm.insertAdjacentElement(specialCase ? 'afterend' : 'beforebegin', newRow);
    }
    const updateGradeDisplay = async function(grades, whatIfScores = null) {
      const gradesText = document.querySelectorAll('.student_assignment.final_grade');
      if (grades === null) {
        grades = await getCourseGrade(course, config, courseAssignments, whatIfScores);
      }
      // gradesArr = [your grade, q1, q2, q3, mean]
      const gradesArr = await Promise.all(grades.map(async grade => {
        return {
          grade,
          // Select the best grading standard values (priority is the following: class config -> class grading standard -> global config -> hard-coded default)
          letterGrade: await getLetterGrade(config.grading_standard ?? classGradingStandard ?? globalConfig.default_grading_standard ?? default_grading_standard, grade)
        }
      }));
      const gradesList = [null,'Lower Quartile','Median','Upper Quartile','Mean'];
      window.courseGrades = grades; // response: [you, q1, q2, q3, mean] {grades are provided in an array of length 5}
  
      gradesText.forEach(grade => {
        if (grade.id === '') {
          // Right side grade display
          const gradeStatisticsContainer = document.createElement('div');
          let marker = 0;
          for (const elm of gradesArr) {
            // Special case for adding the percentile text
            if (marker === 0) {
              grade.replaceChildren(document.createElement('span'));
              // Set the percentage grade text on the course page to the following format: "Total: <grade>% (<letterGrade>)"
              grade.firstElementChild.textContent = elm.grade === 'NG' ? 'Total: No Grade (NG)' : `Total: ${elm.grade}%\u2004(${elm.letterGrade})`;
              // Remove the "grade" class so that Canvas cannot interact with the grade display
              grade.firstElementChild.classList.remove('grade');
              // If the class statistics are -1, then they are unavailable, so exit the loop
              if (gradesArr[1].grade === -1) {
                break;
              }
              // Get class percentile
              const percentile = calculatePercentile(gradesArr[1].grade, gradesArr[2].grade, gradesArr[3].grade, gradesArr[0].grade);
              // Set the top percentile text and style it
              const topPercentile = document.createElement('span');
              topPercentile.textContent = percentile !== null ? `[Top ${Math.round(1e4 - (100 * percentile)) / 100}%]` : '[N/A]';
              topPercentile.style.fontSize = '80%';
              topPercentile.style.marginLeft = '.75vw';
              topPercentile.style.fontWeight = 900;
              topPercentile.id = 'grade_percentile'; // use this for toggling the display
              grade.appendChild(topPercentile);
              // Add a horizontal line for styling
              const hr = document.createElement('hr');
              hr.style.margin = '5px';
              gradeStatisticsContainer.appendChild(hr);
              marker++;
              continue;
            }
            const statGradeTitle = document.createElement('span');
            statGradeTitle.textContent = ` ${gradesList[marker]}: `;
            statGradeTitle.style.fontSize = '85%';
            const statGrade = document.createElement('span');
            // statGrade.classList.add('grade'); //
            statGrade.style.fontSize = '85%';
            statGrade.textContent = `${elm.grade}% (${elm.letterGrade})`;
            gradeStatisticsContainer.appendChild(statGradeTitle);
            gradeStatisticsContainer.appendChild(statGrade);
            gradeStatisticsContainer.appendChild(document.createElement('br'));
            marker++;
            // If the statistics are valid (loop was not broken), then add the statistics container
            if (marker === gradesArr.length) {
              grade.appendChild(gradeStatisticsContainer);
            }
          }
          // Create button for toggling grade statistics if it doesn't exist already
          const toggleGradeStatistics = document.getElementById('toggle_grade_statistics') ?? document.createElement('a');
          // If the grade statistics are not available, then hide the toggle button and don't do anything else
          if (gradesArr[1].grade === -1) {
            toggleGradeStatistics.style.display = 'none';
            toggleGradeStatistics.textContent = '';
            toggleGradeStatistics.href = '';
            return;
          }
          // Function to toggling the display of the class statistics for the current class
          const gradeStatisticsDisplay = function(changingState) {
            const percentile = document.getElementById('grade_percentile');
            const statistics = document.getElementById('grade_statistics');
            // Exit early if the percentile or statistics elements do not exist (should not happen)
            if (percentile === null || statistics === null) {
              return;
            }
            // If the state is being maintained then flip it early (it will be reset later in the function)
            if (!changingState) {
              window.gradeStatisticsViewMode = !window.gradeStatisticsViewMode;
            }
            if (window.gradeStatisticsViewMode) {
              // Hide top percentile and statistics
              percentile.style.display = 'none';
              statistics.style.display = 'none';
              toggleGradeStatistics.textContent = 'Show class statistics';
            } else {
              // Show top percentile and statistics
              percentile.style.display = '';
              statistics.style.display = '';
              toggleGradeStatistics.textContent = 'Hide class statistics';
            }
            window.gradeStatisticsViewMode = !window.gradeStatisticsViewMode;
          }
          // If the toggle grade statistics button is newly created, then configure it
          if (toggleGradeStatistics.id === '') {
            gradeStatisticsContainer.id = 'grade_statistics';
            toggleGradeStatistics.style.display = 'flex';
            toggleGradeStatistics.style.width = 'fit-content';
            toggleGradeStatistics.style.userSelect = 'none';
            toggleGradeStatistics.href = 'javascript:void(0);';
            toggleGradeStatistics.id = 'toggle_grade_statistics';
            toggleGradeStatistics.textContent = 'Hide class statistics'; // Assumes that statistics are shown by default
            toggleGradeStatistics.addEventListener('click', () => gradeStatisticsDisplay(true));
            grade.insertAdjacentElement('afterend', toggleGradeStatistics);
            gradeStatisticsDisplay(false);
          }
        } else {
          // Set table grade display
          const gradeCell = grade.querySelector('span.tooltip span');
          gradeCell.textContent = `${gradesArr[0].grade}% (${gradesArr[0].letterGrade})`;
          // Remove the "grade" class so that Canvas cannot interact with the grade display
          gradeCell.classList.remove('grade');
        }
      });
    }
    // Set the grade display initially (when the course page loads in)
    await updateGradeDisplay(null);
  });
}

// Calculate the percentile that your grade lies in (this is an approximate value and will not be entirely correct due to the lack of data)
const calculatePercentile = function(q1, q2, q3, grade) {
  let percentile;
  if (grade <= q1) {
    percentile = (grade / q1) * 25;
  } else if (grade <= q2) {
    percentile = 25 + ((grade - q1) / (q2 - q1)) * 25;
  } else if (grade <= q3) {
    percentile = 50 + ((grade - q2) / (q3 - q2)) * 25;
  } else {
    percentile = 75 + ((grade - q3) / (100 - q3)) * 25;
  }
  // Round the percentile to two decimal places before returning
  // Also bound sthe percentile in the following range: [0.01, 0.99]
  return Math.max(0.01, Math.min(99.99, Math.round(100 * percentile) / 100));
}

/**
 * If any config is set, then the grade is calculated manually
 * if their is no weighting, then the grade is calculated manually
 * whatIfScores: null / Dictionary / "DOM"
 */
const getCourseGrade = async function(course, config, groups, whatIfScores = null) {
  // If the assignment groups have not been provided, then fetch them and update the groups variable
  if (groups === null) {
    groups = await (await fetch(`/api/v1/courses/${course.id}/assignment_groups?include[]=assignments&include[]=score_statistics&include[]=overrides&include[]=submission`, {
      method: 'GET'
    })).json();
  }
  try {
    // Store assignments and other data for each category
    const map = {}; 
    // Store mapping from group id to group name
    const groupMap = {};
    if (config.use_weighting === undefined) {
      // The course will use weighting if the course provides weighting or if the config has weighting
      config.use_weighting = course.apply_assignment_group_weights || !isObjectEmpty(config.weights);
    }
    // Check if the course is unweighted
    const is_course_unweighted = !config.use_weighting;
    // Calculate statistics and store grades for each assignment group and store them in the map
    for (const group of groups) {
      let groupScore = 0;
      let groupTotal = 0;
      let statsGroupTotal = 0;
      map[group.name] = {};
      groupMap[group.id] = group.name;
      map[group.name].q1 = {};
      map[group.name].q1.score = 0;
      map[group.name].q1.grades = new Array();
      map[group.name].q2 = {}; // q2 = median
      map[group.name].q2.score = 0;
      map[group.name].q2.grades = new Array();
      map[group.name].q3 = {};
      map[group.name].q3.score = 0;
      map[group.name].q3.grades = new Array();
      map[group.name].mean = {};
      map[group.name].mean.score = 0;
      map[group.name].mean.grades = new Array();
      map[group.name].weight = is_course_unweighted ? 1 : (!isObjectEmpty(config.weights) ? config.weights[group.name] : group.group_weight);
      map[group.name].grades = new Array();
      for (const assignment of group.assignments) {
        const gradedAssignmentsOnly = document.getElementById('only_consider_graded_assignments')?.checked ?? true;
        // Do not include assignments that are not counted towards your final grade (also don't include assignments that have not been graded)
        // Only consider missing assignments (as 0's) if the gradedAssignmentsOnly checkbox is not ticked
        if (assignment.omit_from_final_grade || !assignment.graded_submissions_exist || (assignment.submission.missing && (gradedAssignmentsOnly || whatIfScores?.[assignment.id] !== undefined))) {
          continue;
        }
        const statistics = assignment.score_statistics;
        // Use What-If score if there is one available
        const score = whatIfScores === 'DOM' ? getWhatIfGrade(assignment) : whatIfScores?.[assignment.id] ?? assignment.submission.score ?? 0;
        const total = assignment.points_possible;
        map[group.name].grades.push({
          id: assignment.id,
          score,
          total,
          decimal: score / total // Used for sorting assignments (for dropping) - Rounded to 4 decimal places
        });
        if (statistics !== undefined) {
          // Add grade to the list of grades for each stat
          map[group.name].q1.grades.push({
            score: statistics.lower_q,
            total,
            decimal: statistics.lower_q / total
          });
          map[group.name].q2.grades.push({
            score: statistics.median,
            total,
            decimal: statistics.median / total
          });
          map[group.name].q3.grades.push({
            score: statistics.upper_q,
            total,
            decimal: statistics.upper_q / total
          });
          map[group.name].mean.grades.push({
            score: statistics.mean,
            total,
            decimal: statistics.mean / total
          });
          // Contribute to the score total of all of the grades for each stat
          map[group.name].q1.score += statistics.lower_q;
          map[group.name].q2.score += statistics.median;
          map[group.name].q3.score += statistics.upper_q;
          map[group.name].mean.score += statistics.mean;
          statsGroupTotal += total;
        }
        groupScore += score;
        groupTotal += total;
      }
      // Update map with computed values for the current group
      map[group.name].score = groupScore;
      map[group.name].total = groupTotal;
      map[group.name].statsTotal = statsGroupTotal;
      map[group.name].decimal = groupTotal === 0 ? 0 : groupScore / groupTotal;
      map[group.name].q1.total = statsGroupTotal;
      map[group.name].q2.total = statsGroupTotal;
      map[group.name].q3.total = statsGroupTotal;
      map[group.name].mean.total = statsGroupTotal;
      map[group.name].q1.decimal = statsGroupTotal === 0 ? 0 : map[group.name].q1.score / statsGroupTotal;
      map[group.name].q2.decimal = statsGroupTotal === 0 ? 0 : map[group.name].q2.score / statsGroupTotal;
      map[group.name].q3.decimal = statsGroupTotal === 0 ? 0 : map[group.name].q3.score / statsGroupTotal;
      map[group.name].mean.decimal = statsGroupTotal === 0 ? 0 : map[group.name].mean.score / statsGroupTotal;
    }
    // Remove 'dropped' class from all rows that currently have it (re-apply the 'dropped' class manually)
    document.querySelectorAll('#grades_summary .dropped').forEach(assignment => assignment.classList.remove('dropped'));
    // Attempt to perform drops here (also update UI for dropped assignments)
    for (const group of groups) {
      const lowDrops = config.drops?.[group.name]?.[0] ?? group.rules.drop_lowest ?? 0;
      const highDrops = config.drops?.[group.name]?.[1] ?? group.rules.drop_highest ?? 0;
      if (lowDrops === 0 && highDrops === 0) {
        continue;
      }
      // TODO Confirm that this sorting approach works properly 
      // Sort the assignments by simulating the grade after dropping the current assignment (higher grade after drop is placed earlier)
      map[group.name].grades.sort((a,b) => {
        const dec_a = (map[group.name].score - a.score) / (map[group.name].total - a.total);
        const dec_b = (map[group.name].score - b.score) / (map[group.name].total - b.total);
        return dec_b - dec_a;
      });
      // Decrease the score and total properties
      // Create a set of the assignments that should not be dropped
      // TODO Store the assignments that are ignored due to dropped if needed in the future
      const neverDrop = new Set(group.rules.never_drop ?? []);
      // Perform the low drops
      for (let i = 0; i < lowDrops; i++) {
        if (map[group.name].grades.length === 0) {
          break;
        }
        const assignment = map[group.name].grades[0];
        // If the current assignment should not be dropped, then move it to a special array then skip the additional processing
        if (neverDrop.has(assignment.id)) {
          map[group.name].grades.shift();
          // Decrement i since the current assignment is not actually being dropped
          i--;
          continue;
        }
        map[group.name].score -= assignment.score;
        map[group.name].total -= assignment.total;
        // Remove elements from grades array
        map[group.name].grades.shift();
        // Apply dropped UI by adding the 'dropped' class to the assignment row that is being dropped (uses assignment ID)
        if (document.title !== 'Dashboard') {
          document.getElementById(`submission_${assignment.id}`).classList.add('dropped');
        }
      }
      // Perform the high drops
      for (let i = 0; i < highDrops; i++) {
        if (map[group.name].grades.length === 0) {
          break;
        }
        const assignment = map[group.name].grades[map[group.name].grades.length-1];
        // If the current assignment should not be dropped, then move it to a special array then skip the additional processing
        if (neverDrop.has(assignment.id)) {
          map[group.name].grades.pop();
          // Decrement i since the current assignment is not actually being dropped
          i--;
          continue;
        }
        map[group.name].score -= assignment.score;
        map[group.name].total -= assignment.total;
        map[group.name].grades.pop();
        // Apply dropped UI by adding the 'dropped' class to the assignment row that is being dropped (uses assignment ID)
        if (document.title !== 'Dashboard') {
          document.getElementById(`submission_${assignment.id}`).classList.add('dropped');
        }
      }
      // Re-calculate the decimal for the current group after applying drops
      map[group.name].decimal = map[group.name].total === 0 ? 0 : Math.round((1e4 * map[group.name].score) / map[group.name].total) / 1e4;
    }
    // Update group total rows at the bottom of the table
    const groupTotals = document.querySelectorAll('.group_total');
    for (const row of groupTotals) {
      const groupID = RegExp(/\d+/).exec(row.id)[0];
      const groupName = groupMap[groupID];
      const groupScore = map[groupName].score.toFixed(2);
      const groupTotal = map[groupName].total.toFixed(2);
      const groupPercentage = Math.round(1e4 * map[groupName].decimal) / 1e2;
      // Change the text while also removing the child of these elements, thus severing cell from any Canvas-enforced updates
      row.querySelector('span.tooltip').textContent = groupTotal === '0.00' ? 'N/A' : groupPercentage + '%';
      row.querySelector('td.details').textContent = `${groupScore} / ${groupTotal}`;
    }
    let completeScore = 0;
    let completeTotal = 0;
    // If the course is unweighted, then compute the grade (and statistics grades too if applicable)
    if (is_course_unweighted) {
    const stats = { q1: [0,0], q2: [0,0], q3: [0,0], mean: [0,0] };
      for (const group of groups) {
        // Compute score and total for your grade
        completeScore += map[group.name].score;
        completeTotal += map[group.name].total;
        // If the statsTotal is 0, then don't continue to compute this group
        if (map[group.name].statsTotal === 0) {
          continue;
        }
        // Compute the score and total for the class statistics
        stats.q1[0] += map[group.name].q1.score;
        stats.q2[0] += map[group.name].q2.score;
        stats.q3[0] += map[group.name].q3.score;
        stats.mean[0] += map[group.name].mean.score;
        stats.q1[1] += map[group.name].q1.total;
        stats.q2[1] += map[group.name].q2.total;
        stats.q3[1] += map[group.name].q3.total;
        stats.mean[1] += map[group.name].mean.total;
      }
      // If there are no grades contributing to the class statistics, then return -1 
      // Grades are all rounded to 2 decimal places 
      return [completeTotal === 0 ? 'NG' : Math.round(10000 * completeScore / completeTotal) / 100]
      .concat(stats.q1[1] === 0 ? new Array(4).fill(-1) : [
        Math.round(10000 * stats.q1[0] / stats.q1[1]) / 100,
        Math.round(10000 * stats.q2[0] / stats.q2[1]) / 100,
        Math.round(10000 * stats.q3[0] / stats.q3[1]) / 100,
        Math.round(10000 * stats.mean[0] / stats.mean[1]) / 100
      ]);
    }
    let classScore = 0;
    let weightTotal = 0;
    let statsWeightTotal = 0;
    const stats = { q1: 0, q2: 0, q3: 0, mean: 0 };
    for (const group of groups) {
      // If there are no grades available in this group, then don't process this group
      if (map[group.name].total === 0) {
        continue;
      }
      // Compute the class score while considering weighting
      classScore += map[group.name].decimal * map[group.name].weight;
      // Keep track of the total weight being used for your grade
      weightTotal += map[group.name].weight;
        // If the statsTotal is 0, then don't continue to compute this group
      if (map[group.name].statsTotal === 0) {
        continue;
      }
      // Keep track of the total weight being used for the class statistics
      statsWeightTotal += map[group.name].weight;
      // Compute the grades for class statistics while considering weighting
      stats.q1 += map[group.name].q1.decimal * map[group.name].weight;
      stats.q2 += map[group.name].q2.decimal * map[group.name].weight;
      stats.q3 += map[group.name].q3.decimal * map[group.name].weight;
      stats.mean += map[group.name].mean.decimal * map[group.name].weight;
    }
    // Compute scalars for determining how to scale your grade and the class statistics grades 
    // Solves the issue of having assignment groups with 0 entries being stored as a 0
    const k = weightTotal === 0 ? 0 : 100 / weightTotal;
    const statsK = statsWeightTotal === 0 ? 0 : 100 / statsWeightTotal;
    // Round to two decimal places 
    return [k === 0 ? 'NG' : Math.round(100 * k * classScore) / 100]
    .concat(statsK === 0 ? new Array(4).fill(-1) : [
      Math.round(100 * statsK * stats.q1) / 100,
      Math.round(100 * statsK * stats.q2) / 100,
      Math.round(100 * statsK * stats.q3) / 100,
      Math.round(100 * statsK * stats.mean) / 100,
    ]);
  } catch (err) {
    console.error(`An error has occured when calculating the course grade for ${course.course_code}`, err);
  } 
}

// Get the What-If using the DOM (check the current assignments score cell for the changed class)
const getWhatIfGrade = function (assignment) {
  const scoreCell = document.getElementById(`submission_${assignment.id}`).querySelector('span.grade');
  return scoreCell.classList.contains('changed') ? +scoreCell.firstChild.textContent.replace(/,/g, '') : assignment.submission.score ?? 0
}

// Return the letter grade for an associated grade, using a course's config to retrieve the grading standard
const getLetterGrade = async function(gradingStandard, grade) {
  // If there is no grade, then return null
  if (grade === 'NG') {
    return null;
  }
  if (grade < 0) {
    return 'N/A';
  }

  // Default grading scheme (sorting in descending order)
  const weights = Object.keys(gradingStandard).map(Number);
  // Binary search on the weights
  let left = 0, right = weights.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const rightMid = weights[mid+1] ?? Infinity;
    if (grade >= weights[mid] && grade < rightMid) {
      return gradingStandard[weights[mid]];
    } else if (grade < weights[mid]) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  return 'N/A';
}

const retrieveGradingStandard = async function(courseID, gradingStandardID) {
  const grading_standard = (await (await fetch(`/api/v1/courses/${courseID}/grading_standards/${gradingStandardID}`)).json()).grading_scheme;
  const grading_standard_map = {};
  for (const {name,value} of grading_standard) {
    grading_standard_map[100*value] = name;
  }
  return grading_standard_map;
}

const saveConfig = async function(config, courseID) {
  // If the config that is being updated is global, then just update that individual property and you're done
  // Global config: courseID = null
  if (courseID === null) {
    // config format -> { key : value }
    await chrome.storage.local.set(config);
    return;
  }
  // Or else the config is class specific, which means that you have to update it using the courseID
  await chrome.storage.local.set({ [courseID] : config});
}