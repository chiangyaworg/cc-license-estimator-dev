// Function to handle tab switching
function openTab(evt, tabName) {
    var i, tabcontent, tablinks;

    // Get all elements with class="tab-content" and hide them
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
        tabcontent[i].classList.remove("active-tab");
    }

    // Get all elements with class="tab-button" and remove the "active" class
    tablinks = document.getElementsByClassName("tab-button");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].classList.remove("active");
    }

    // Show the current tab, and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    document.getElementById(tabName).classList.add("active-tab");
    evt.currentTarget.classList.add("active");
}

// Set 'Estimator' as the default active tab on load
document.addEventListener('DOMContentLoaded', () => {
    // Hide all tabs first
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.style.display = 'none';
        tab.classList.remove('active-tab');
    });

    // Explicitly show the default tab and set the active button (using the new ID: Estimator)
    const defaultTab = document.getElementById('Estimator');
    const defaultButton = document.querySelector('.tab-button'); // Assumes the first button is the default

    if (defaultTab && defaultButton) {
        defaultTab.style.display = 'block';
        defaultTab.classList.add('active-tab');
        defaultButton.classList.add('active');
    }
});

// Attach calculation function to the form submit event
document.getElementById('estimator-form').addEventListener('submit', function(e) {
    e.preventDefault();
    calculateLicenses();
});

function calculateLicenses() {
    // --- Workload to Billable Unit Ratios ---
    const RATIOS = {
        'vms-not-running-containers': 1,
        'vms-running-containers': 1,
        'caas-managed-containers': 1 / 10,       // 10 Managed Containers = 1 Workload
        'serverless-functions': 1 / 25,          // 25 Serverless Functions = 1 Workload
        'cloud-buckets': 1 / 10,                 // 10 Cloud Buckets = 1 Workload
        'managed-cloud-database': 1 / 2,         // 2 PaaS Databases = 1 Workload
        'dbaas-tb-stored': 1,                    // 1 TB Stored = 1 Workload
        'saas-users': 1 / 10,                    // 10 SaaS Users = 1 Workload
        'container-images': 1 / 10,              // 10 container image scans = 1 Workload (beyond free quota)
        // 'unmanaged-assets' ratio removed
    };

    // --- Get Input Values ---
    const inputs = {
        'vms-not-running-containers': parseInt(document.getElementById('vms-not-running-containers').value) || 0,
        'vms-running-containers': parseInt(document.getElementById('vms-running-containers').value) || 0,
        'caas-managed-containers': parseInt(document.getElementById('caas-managed-containers').value) || 0,
        'serverless-functions': parseInt(document.getElementById('serverless-functions').value) || 0,
        'container-images': parseInt(document.getElementById('container-images').value) || 0,
        'cloud-buckets': parseInt(document.getElementById('cloud-buckets').value) || 0,
        'managed-cloud-database': parseInt(document.getElementById('managed-cloud-database').value) || 0,
        'dbaas-tb-stored': parseInt(document.getElementById('dbaas-tb-stored').value) || 0,
        'saas-users': parseInt(document.getElementById('saas-users').value) || 0,
        'developers': parseInt(document.getElementById('developers').value) || 0,
        // 'unmanaged-assets' input removed
    };

    // --- Get Ticked Features ---
    const features = {
        posture: document.getElementById('feature-posture').checked,
        runtime: document.getElementById('feature-runtime').checked,
        application: document.getElementById('feature-application').checked,
        cloudAsm: document.getElementById('feature-cloud-asm').checked
    };

    const resultsElement = document.getElementById('results-section');
    resultsElement.innerHTML = ''; 

    // --- Step 1: Calculate Workloads ---
    const postureWorkloadUnits = 
        (inputs['cloud-buckets'] * RATIOS['cloud-buckets']) +
        (inputs['managed-cloud-database'] * RATIOS['managed-cloud-database']) +
        (inputs['dbaas-tb-stored'] * RATIOS['dbaas-tb-stored']) +
        (inputs['saas-users'] * RATIOS['saas-users']);
    
    const runtimeWorkloadUnits = 
        (inputs['vms-not-running-containers'] * RATIOS['vms-not-running-containers']) +
        (inputs['vms-running-containers'] * RATIOS['vms-running-containers']) +
        (inputs['caas-managed-containers'] * RATIOS['caas-managed-containers']) +
        (inputs['serverless-functions'] * RATIOS['serverless-functions']) +
        (inputs['container-images'] * RATIOS['container-images']);

    const posture_workload_sum = Math.ceil(postureWorkloadUnits);
    const runtime_workload_sum = Math.ceil(runtimeWorkloadUnits);
    const developer_sum = inputs['developers'];
    // const unmanaged_assets_sum removed
    const total_workload_sum = posture_workload_sum + runtime_workload_sum;

    let resultString = [];
    const coreSecuritySelected = features.posture || features.runtime;

    // --- Step 2: Apply Logic based on Ticked Features ---
    if (!features.posture && !features.runtime && !features.application && !features.cloudAsm) {
        resultsElement.innerHTML = '<span class="error">None of the features are chosen, please try again</span>';
        return;
    }

    if (features.application && !features.posture && !features.runtime) {
        resultsElement.innerHTML = '<span class="error">Application Security can only be added as add-ons, on top of Posture Security or Runtime Security</span>';
        return;
    }

    // --- Determine Core Security License (Posture/Runtime) ---
    let postureLicense = 0;
    let runtimeLicense = 0;
    
    if (features.posture && !features.runtime) {
        // Scenario: Only Posture Security is ticked
        // If Posture only, add runtime_workload_sum into postureLicense
        let effectivePostureWorkload = posture_workload_sum + runtime_workload_sum;

        if (effectivePostureWorkload > 0) {
            postureLicense = Math.max(effectivePostureWorkload, 200);
        } else {
            postureLicense = 0;
        }

    } else if (features.runtime || (features.posture && features.runtime)) {
        // Scenario: Runtime Security is ticked, or both Posture and Runtime are ticked

        if (posture_workload_sum > 200 || runtime_workload_sum > 200) {
            // Rule 1: If either one is more than 200
            postureLicense = posture_workload_sum;
            runtimeLicense = runtime_workload_sum;
            
        } else if (total_workload_sum > 200) {
            // Rule 2: Both are <= 200, but total is > 200 (Ambiguous/circular rule)
            postureLicense = runtime_workload_sum;
            runtimeLicense = runtime_workload_sum;
            
        } else if (total_workload_sum > 0) { 
            // Rule 3: Total is less than 200 (but must be greater than 0)
            runtimeLicense = 200; 
            postureLicense = 0; 
        } else {
            postureLicense = 0;
            runtimeLicense = 0;
        }
    }
    
    // --- Step 3: Apply Cloud ASM Multiplier (if selected) ---
    if (features.cloudAsm) {
        const multiplier = 1.25;
        // Apply multiplier and round up the core licenses
        postureLicense = Math.ceil(postureLicense * multiplier);
        runtimeLicense = Math.ceil(runtimeLicense * multiplier);
        
        // Cloud ASM license line logic removed
    }

    // --- Step 4: Output Core Security Licenses ---
    if (postureLicense > 0) {
        resultString.push(`Posture Security License Required: ${postureLicense}`);
    }
    if (runtimeLicense > 0) {
        resultString.push(`Runtime Security License Required: ${runtimeLicense}`);
    }


    // --- Step 5: Application Security Add-on ---
    if (features.application && coreSecuritySelected) {
        const appSecLicense = developer_sum > 5 ? developer_sum : 5;
        resultString.push(`Application Security License Required: ${appSecLicense}`);
    }

    // --- Step 6: Cloud ASM License Line removed ---


    // --- Final Output ---
    if (resultString.length === 0) {
        resultsElement.innerHTML = "No license required based on your current inputs and feature selection.";
    } else {
        resultsElement.innerHTML = resultString.join('\n');
    }
}