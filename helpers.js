import { load, dump } from 'js-yaml';
import { readFileSync, writeFileSync, existsSync } from 'fs';

import { exec } from 'child_process';
import { promisify } from 'node:util';
const execPromise = promisify(exec);

export const logInToAws = async (deploymentRegistryMap, deploymentTarget) => {
  // Log into AWS
  console.log('Logging into AWS...');
  await execPromise(
    `aws ecr get-login-password --region ${deploymentRegistryMap[deploymentTarget].region} | docker login --username AWS --password-stdin ${deploymentRegistryMap[deploymentTarget].containerDestination}`
  );
};

export const configureKubeCtl = async (
  deploymentRegistryMap,
  deploymentTarget
) => {
  // Log into AWS
  console.log('Configuring kubectl...');
  await execPromise(
    `aws eks --region ${deploymentRegistryMap[deploymentTarget].region} update-kubeconfig --name ${deploymentRegistryMap[deploymentTarget].clusterName}`
  );
};

export const cloneGitRepo = async (deploymentObject, deploymentTarget) => {
  console.log(`Module: ${deploymentObject.title}...`);
  // Remove any previous cloned folder
  await execPromise(
    `rm -rf deployment/${deploymentTarget}/${deploymentObject.folder}/${deploymentObject.gitFolder}`
  );

  // Git clone
  console.log(` . ${deploymentObject.title}: cloning git repo...`);
  await execPromise(
    `cd deployment/${deploymentTarget}/${deploymentObject.folder} && git clone ${deploymentObject.git}`
  );
};

export const buildPackage = async (
  deploymentObject,
  deploymentTarget,
  deploymentRegistryMap
) => {
  console.log(` . ${deploymentObject.title}: docker building for amd64...`);
  if (deploymentObject.git) {
    await execPromise(
      `cd deployment/${deploymentTarget}/${deploymentObject.folder}/${deploymentObject.gitFolder} && sudo docker build -t ${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} . --platform=linux/amd64 && docker tag ${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} ${deploymentRegistryMap[deploymentTarget].containerDestination}/${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} && sudo docker push ${deploymentRegistryMap[deploymentTarget].containerDestination}/${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version}`
    );
  } else {
    await execPromise(
      `cd deployment/${deploymentTarget}/${deploymentObject.folder} && sudo docker build -t ${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} . --no-cache --platform=linux/amd64 && docker tag ${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} ${deploymentRegistryMap[deploymentTarget].containerDestination}/${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version} && sudo docker push ${deploymentRegistryMap[deploymentTarget].containerDestination}/${deploymentObject.label}:v${deploymentRegistryMap[deploymentTarget].version}`
    );
  }
};

export const removePreviousContainer = async (
  deploymentObject,
  deploymentTarget
) => {
  // Remove previous container
  console.log(
    ` . ${deploymentObject.title}: removing previous kubectl container ...`
  );
  try {
    await execPromise(
      `kubectl delete -f deployment/${deploymentTarget}/${deploymentObject.folder}/01-deployment.yml`
    );
  } catch (error) {
    console.log(
      ` . ${deploymentObject.title}: error while removing previous kubectl application. It's likely there wasn't one running.`
    );
    //console.log(error);
  }
};

export const updateYaml = (
  deploymentObject,
  version,
  deploymentTarget,
  deploymentRegistryMap
) => {
  console.log(
    ` . ${deploymentObject.title}: updating YAML with version to ${deploymentRegistryMap[deploymentTarget].version}...`
  );
  try {
    let doc = load(
      readFileSync(
        `deployment/${deploymentTarget}/${deploymentObject.folder}/01-deployment.yml`,
        'utf8'
      )
    );

    doc.spec.template.spec.containers.at(
      0
    ).image = `${deploymentRegistryMap[deploymentTarget].containerDestination}/${deploymentObject.label}:v${version}`;

    writeFileSync(
      `deployment/${deploymentTarget}/${deploymentObject.folder}/01-deployment.yml`,
      dump(doc)
    );
  } catch (error) {
    console.log('Error: an error occured while parsing the YAML.');
    console.log(error);
  }
};

export const applyNewContainer = async (deploymentObject, deploymentTarget) => {
  // Add new container
  console.log(
    ` . ${deploymentObject.title}: adding new kubectl application...`
  );
  await execPromise(
    `kubectl apply -f deployment/${deploymentTarget}/${deploymentObject.folder}/01-deployment.yml`
  );
};

export const applyLoadBalancer = async (deploymentObject, deploymentTarget) => {
  if (
    !existsSync(
      `deployment/${deploymentTarget}/${deploymentObject.folder}/02-load-balancer.yml`
    )
  ) {
    console.log(' . Could not find LoadBalancer yml file');
    return;
  }
  // Add new container
  console.log(` . ${deploymentObject.title}: applying LoadBalancer...`);
  try {
    await execPromise(
      `kubectl apply -f deployment/${deploymentTarget}/${deploymentObject.folder}/02-load-balancer.yml`
    );
  } catch (error) {
    console.log(
      ` . ${deploymentObject.title}: error while applying load-balancer...`
    );
    console.log(error);
  }
};

export const applyNodePort = async (deploymentObject, deploymentTarget) => {
  if (
    !existsSync(
      `deployment/${deploymentTarget}/${deploymentObject.folder}/04-node-port.yml`
    )
  ) {
    console.log(' . Could not find NodePort yml file');
    return;
  }
  // Add new container
  console.log(` . ${deploymentObject.title}: applying NodePort...`);
  try {
    await execPromise(
      `kubectl apply -f deployment/${deploymentTarget}/${deploymentObject.folder}/04-node-port.yml`
    );
  } catch (error) {
    console.log(
      ` . ${deploymentObject.title}: error while applying NodePort...`
    );
    console.log(error);
  }
};
