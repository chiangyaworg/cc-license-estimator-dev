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
    
    // Add 'active' class to the current target (the button) only if the event exists
    if (evt) {
        evt.currentTarget.classList.add("active");
    }
}

// Set 'Estimator' as the default active tab on load
document.addEventListener('DOMContentLoaded', () => {
    // Call the openTab function directly with a null event 
    // and the default tab name to ensure the state is set correctly.
    openTab(null, 'Estimator'); 

    // Manually set the active class on the first button (Estimator) since the event is null
    const defaultButton = document.querySelector('.tab-button');
    if (defaultButton) {
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
    };
    const MOQ = 200;
    const ASM_MULTIPLIER = 1.25;

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

    // --- Step 1: Calculate Base Workloads (Before rounding/MOQ) ---
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

    // --- Step 2: Apply Cloud ASM Multiplier to Workloads (FIX 1) ---
    let finalPostureWorkload = postureWorkloadUnits;
    let finalRuntimeWorkload = runtimeWorkloadUnits;
    
    if (features.cloudAsm) {
        finalPostureWorkload = postureWorkloadUnits * ASM_MULTIPLIER;
        finalRuntimeWorkload = runtimeWorkloadUnits * ASM_MULTIPLIER;
    }

    // Round up the final workloads
    const posture_workload_sum = Math.ceil(finalPostureWorkload);
    const runtime_workload_sum = Math.ceil(finalRuntimeWorkload);
    const developer_sum = inputs['developers'];
    const total_workload_sum = posture_workload_sum + runtime_workload_sum;

    let resultString = [];
    const coreSecuritySelected = features.posture || features.runtime;

    // --- Step 3: Check for Errors ---
    if (!features.posture && !features.runtime && !features.application && !features.cloudAsm) {
        resultsElement.innerHTML = '<span class="error">None of the features are chosen, please try again</span>';
        return;
    }

    if (features.application && !features.posture && !features.runtime) {
        resultsElement.innerHTML = '<span class="error">Application Security can only be added as add-ons, on top of Posture Security or Runtime Security</span>';
        return;
    }

    // --- Step 4: Determine Core Security License (Posture/Runtime) ---
    let postureLicense = 0;
    let runtimeLicense = 0;
    
    if (features.posture && !features.runtime) {
        // Scenario: Only Posture Security is ticked
        // If Posture only, add runtime_workload_sum into postureLicense
        let effectivePostureWorkload = posture_workload_sum + runtime_workload_sum;

        if (effectivePostureWorkload > 0) {
            postureLicense = Math.max(effectivePostureWorkload, MOQ);
        } else {
            postureLicense = 0;
        }

    } else if (features.runtime || (features.posture && features.runtime)) {
        // Scenario: Runtime Security is ticked, or both Posture and Runtime are ticked

        if (posture_workload_sum >= MOQ && runtime_workload_sum >= MOQ) {
            // Rule 1: If each are more than 200 (MOQ fulfilled both side)
            postureLicense = posture_workload_sum;
            runtimeLicense = runtime_workload_sum;
            
        } else if ((posture_workload_sum < MOQ && runtime_workload_sum < MOQ) && posture_workload_sum > 0 && runtime_workload_sum > 0) {
            // Rule 2: If both are lower than 200, either one needs to fulfill MOQ
            if (runtime_workload_sum >= (MOQ/2)){
                runtimeLicense = MOQ;
                postureLicense = total_workload_sum - MOQ;
            }
            else {
                runtimeLicense = runtime_workload_sum;
                postureLicense = MOQ;
            }
        } else if (posture_workload_sum >= MOQ && runtime_workload_sum < MOQ){
            // Rule 3: Posture fulfill MOQ
            postureLicense = posture_workload_sum;
            runtimeLicense = runtime_workload_sum;
        } else if (posture_workload_sum < MOQ && runtime_workload_sum >= MOQ){
            // Rule 4: Runtime fulfill MOQ
            postureLicense = posture_workload_sum;
            runtimeLicense = runtime_workload_sum;
        } else {
            // Total workload is 0, something is wrong
            postureLicense = 0;
            runtimeLicense = 0;
        }
    }
    

    // --- Step 5: Output Licenses ---

    // Core Licenses
    if (postureLicense > 0) {
        resultString.push(`Posture Security License Required: ${postureLicense}`);
    }
    if (runtimeLicense > 0) {
        resultString.push(`Runtime Security License Required: ${runtimeLicense}`);
    }


    // Application Security Add-on
    if (features.application && coreSecuritySelected) {
        const appSecLicense = developer_sum > 5 ? developer_sum : 5;
        resultString.push(`Application Security License Required: ${appSecLicense}`);
    }


    // --- Final Output ---
    if (resultString.length === 0) {
        resultsElement.innerHTML = "No license required based on your current inputs and feature selection.";
    } else {
        resultsElement.innerHTML = resultString.join('\n');
    }
}