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
        'unmanaged-assets': 1 / 4                // 4 Unmanaged Assets = 1 Workload (0.25) // UPDATED
    };
    const MOQ = 200;
    // ASM_MULTIPLIER logic REMOVED

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
        'unmanaged-assets': parseInt(document.getElementById('unmanaged-assets').value) || 0
    };

    // --- Get Ticked Features ---
    const features = {
        posture: document.getElementById('feature-posture').checked,
        runtime: document.getElementById('feature-runtime').checked,
        application: document.getElementById('feature-application').checked,
        // cloudAsm check REMOVED
    };

    const resultsElement = document.getElementById('results-section');
    resultsElement.innerHTML = ''; 

    // --- Step 1: Calculate Base Workloads ---

    // Posture Workloads (UPDATED to include unmanagedWorkloadUnits)
    const postureWorkloadUnits = 
        (inputs['cloud-buckets'] * RATIOS['cloud-buckets']) +
        (inputs['managed-cloud-database'] * RATIOS['managed-cloud-database']) +
        (inputs['dbaas-tb-stored'] * RATIOS['dbaas-tb-stored']) +
        (inputs['saas-users'] * RATIOS['saas-users']) +
        (inputs['unmanaged-assets'] * RATIOS['unmanaged-assets']);
    
    // Runtime Workloads
    const runtimeWorkloadUnits = 
        (inputs['vms-not-running-containers'] * RATIOS['vms-not-running-containers']) +
        (inputs['vms-running-containers'] * RATIOS['vms-running-containers']) +
        (inputs['caas-managed-containers'] * RATIOS['caas-managed-containers']) +
        (inputs['serverless-functions'] * RATIOS['serverless-functions']) +
        (inputs['container-images'] * RATIOS['container-images']);
    
    // No ASM Multiplier logic needed here, so final workloads are the rounded base workloads
    const posture_workload_sum = Math.ceil(postureWorkloadUnits);
    const runtime_workload_sum = Math.ceil(runtimeWorkloadUnits);
    
    const developer_sum = inputs['developers'];
    const total_workload_sum = posture_workload_sum + runtime_workload_sum;

    let resultString = [];
    // cloudAsm is now implicitly handled in posture_workload_sum
    const coreSecuritySelected = features.posture || features.runtime;

    // --- Step 2: Check for Errors ---
    if (!features.posture && !features.runtime && !features.application) {
        // Updated error check: Cloud ASM is no longer a separate feature for this check
        resultsElement.innerHTML = '<span class="error">None of the features are chosen, please try again</span>';
        return;
    }

    if (features.application && !features.posture && !features.runtime) {
        resultsElement.innerHTML = '<span class="error">Application Security can only be added as add-ons, on top of Posture Security or Runtime Security</span>';
        return;
    }

    // --- Step 3: Determine Core Security License (Posture/Runtime) ---
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

        // Rule 1, 3, 4: At least one side fulfills MOQ, or both fulfill MOQ
        if (posture_workload_sum >= MOQ || runtime_workload_sum >= MOQ){
            // If MOQ is met on one side, both sides take their actual workload.
            postureLicense = posture_workload_sum;
            runtimeLicense = runtime_workload_sum;
            
        // Rule 2: Both are below MOQ, but at least one is > 0
        } else if (posture_workload_sum > 0 || runtime_workload_sum > 0) {
            
            // Sub-rule 2.1: Total is > MOQ (Combined low workload meets combined MOQ)
            if (total_workload_sum > MOQ) {
                // Follow the prompt's ambiguous/circular rule: Posture: runtime_workload_sum, Runtime: runtime_workload_sum
                postureLicense = runtime_workload_sum;
                runtimeLicense = runtime_workload_sum;
            }
            
            // Sub-rule 2.2: Total is <= MOQ (Apply MOQ and allocate based on Runtime threshold)
            else {
                // Apply 200 MOQ, allocation based on runtime_workload_sum threshold (MOQ/2 = 100)
                if (runtime_workload_sum >= (MOQ / 2)) {
                    // Runtime takes the MOQ (200), Posture takes the remainder (clamped at 0 if total < 200).
                    runtimeLicense = MOQ;
                    postureLicense = Math.max(0, total_workload_sum - MOQ); 
                    
                } else {
                    // Posture takes the MOQ (200), Runtime takes its actual workload.
                    runtimeLicense = runtime_workload_sum;
                    postureLicense = MOQ;
                }
            }
        } else {
            // Total workload is 0
            postureLicense = 0;
            runtimeLicense = 0;
        }
    }
    

    // --- Step 4: Output Licenses ---

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