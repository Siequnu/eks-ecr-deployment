import { exec } from 'child_process';
import { promisify } from 'node:util';
import inquirer from 'inquirer';

const execPromise = promisify(exec);

import {
  deploymentRegistry,
} from './deployment.js';

import {
  logInToAws,
  configureKubeCtl,
  cloneGitRepo,
  buildPackage,
  removePreviousContainer,
  updateYaml,
  applyNewContainer,
  applyLoadBalancer,
  applyNodePort,
} from './helpers.js';

console.log('');
console.log('Starting Hephaestus');

// Prompt user for deployment target
let deploymentTarget = '';
await inquirer
  .prompt([
    {
      type: 'list',
      name: 'deployment',
      message: 'Please enter deployment target:',
      choices: ['Deployment target 1'],
    },
  ])
  .then((answers) => {
    deploymentTarget = answers;
  });
console.log(`Deployment target is ${deploymentTarget.deployment}`);
deploymentTarget = deploymentTarget.deployment.replace(' ', '_').toLowerCase();

// Exit if no deployment target found
const deploymentRegistryMap = {
  deployment_target_1: deploymentRegistry,
  
};
if (!deploymentRegistryMap.hasOwnProperty(deploymentTarget)) {
  console.log(
    `Error: could not find a matching deployment target for ${deploymentTarget}`
  );
}

// Export API keys
if (deploymentRegistryMap[deploymentTarget].hasOwnProperty('api')) {
  console.log('Exporting AWS credentials...');

  await execPromise(
    `export AWS_ACCESS_KEY_ID="${deploymentRegistryMap[deploymentTarget].awsAccessKeyId}"`
  );
  await execPromise(
    `export AWS_SECRET_ACCESS_KEY="${deploymentRegistryMap[deploymentTarget].awsSecretAccessKey}"`
  );
}

// Log in to AWS
await logInToAws(deploymentRegistryMap, deploymentTarget);
await configureKubeCtl(deploymentRegistryMap, deploymentTarget);

// Choose which containers to action on
let chosenDeploymentContainers = [];
await inquirer
  .prompt([
    {
      type: 'checkbox',
      name: 'deployment-containers',
      message: `Please select the containers to deploy`,
      choices: deploymentRegistryMap[deploymentTarget].deploymentObjects
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((object) => object.title),
    },
  ])
  .then(async (answers) => {
    chosenDeploymentContainers = answers['deployment-containers'];
  });

console.log('Selected contains:');
chosenDeploymentContainers.forEach((containerName) =>
  console.log(containerName)
);

// Ask whether to clone repos
await inquirer
  .prompt([
    {
      type: 'confirm',
      name: 'clone-repos',
      message: `There are repos that can be cloned. Proceed to clone?`,
    },
  ])
  .then(async (answers) => {
    if (answers['clone-repos']) {
      // Clone any packages
      console.log('Obtaining packages...');
      for (const deploymentObject of deploymentRegistryMap[deploymentTarget]
        .deploymentObjects) {
        // Clone git if necessary
        if (
          deploymentObject.git &&
          chosenDeploymentContainers.includes(deploymentObject.title)
        ) {
          await cloneGitRepo(deploymentObject, deploymentTarget);
        }
      }
    }
  });

// Wait until user has updated cloned git confs
await inquirer
  .prompt([
    {
      type: 'confirm',
      name: 'config-set',
      message: `Please update configs in cloned repos and confirm:`,
    },
  ])
  .then((answers) => {});

// Docker build, tag and push packages
console.log('Building packages...');
for (const deploymentObject of deploymentRegistryMap[deploymentTarget]
  .deploymentObjects) {
  if (chosenDeploymentContainers.includes(deploymentObject.title)) {
    console.log(`Module: ${deploymentObject.title}...`);

    await buildPackage(
      deploymentObject,
      deploymentTarget,
      deploymentRegistryMap
    );

    await logInToAws(deploymentRegistryMap, deploymentTarget); // Is this log-in really necessary?

    await removePreviousContainer(deploymentObject, deploymentTarget);

    updateYaml(
      deploymentObject,
      deploymentRegistryMap[deploymentTarget].version,
      deploymentTarget,
      deploymentRegistryMap
    );

    await applyNewContainer(deploymentObject, deploymentTarget);
  }
}

// Apply load balancers
await inquirer
  .prompt([
    {
      type: 'confirm',
      name: 'apply-lb',
      message: `Would you like to apply Loadbalancers??`,
    },
  ])
  .then(async (answers) => {
    if (answers['apply-lb']) {
      // Docker build, tag and push packages
      console.log('Applying Loadbalancers...');
      for (const deploymentObject of deploymentRegistryMap[deploymentTarget]
        .deploymentObjects) {
        if (chosenDeploymentContainers.includes(deploymentObject.title)) {
          console.log(`Module: ${deploymentObject.title}...`);
          await applyLoadBalancer(deploymentObject, deploymentTarget);
        }
      }
    }
  });

// Apply NodePorts
await inquirer
  .prompt([
    {
      type: 'confirm',
      name: 'apply-np',
      message: `Would you like to apply NodePorts??`,
    },
  ])
  .then(async (answers) => {
    if (answers['apply-np']) {
      // Docker build, tag and push packages
      console.log('Applying NodePorts...');
      for (const deploymentObject of deploymentRegistryMap[deploymentTarget]
        .deploymentObjects) {
        if (chosenDeploymentContainers.includes(deploymentObject.title)) {
          console.log(`Module: ${deploymentObject.title}...`);
          await applyNodePort(deploymentObject, deploymentTarget);
        }
      }
    }
  });

// Done
console.log('Hephaestus completed successfully!');
console.log('You can check pod status by typing `kubectl get pods`');
console.log('You can check service status by typing `kubectl get services`');
console.log('To find NodePort IPs and ports type:');
console.log(
  `kubectl get nodes -o wide |  awk {'print $1" " $2 " " $6'} | column -t`
);
