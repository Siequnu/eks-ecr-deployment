# EKS and ECR deployment

## Hephaestus

This script will automate the `git clone`, `docker build`, `docker tag`, and upload process to EKS.

## Running hephaestus-deployment

1. `git clone` the hephaestus-deployment repository to a location on your harddrive
2. Install dependencies by running `npm install` within the cloned directory
3. Copy `deployment.js.sample` to `deployment.js` and fill out the details. Multiple deployments objects can be exported in this file. Please note the hardcoded caveat noted below (Current deployment keyword mappings)
4. Ensure that a folder exists in the deployment directory of this repo containing the packages to be built. An example is given below.
5. Export the AWS environmental variables. These can be found on the AWS management console.

   `export AWS_ACCESS_KEY_ID="secret_key"`
   `export AWS_SECRET_ACCESS_KEY="secret_access_key"`
   `export AWS_SESSION_TOKEN="session_token"`

6. Run using `node hephaestus.js`. Follow the wizard steps.

## Steps in the hephaestus script

The script follows the following steps

1. Request a deployment target. See hardcoded target caveats in 'Populating deployment.js' and 'Current deployment keyword mappings' below.
2. Log-in to AWS CLI. The script will periodically refresh the login in case of expiration.
3. Export AWS environmental configs.
4. If there are repos that are to be cloned from git, prompt to do so.
5. For each enabled package in deployment.js:
   - `docker build`
   - `docker push`
   - remove the previous container
   - update the yaml with the vversion number in `deployment.js`
   - apply the new container
6. Prompt to expose the instances via a LoadBalancer, which should be in the builder folder as `02-load-balancer.yml`
7. Prompt to expose the instances via a NodePort, which should be in the builder folder as `04-node-port.yml`

## Current deployment keyword mappings

The hephaestus-deployment currently contains regrettably hardcoded mappings between deployment keywords and imports. Please do make a PR to remove this debt.

| Deployment          | File          | Harcoded mappings                                                    |
| ------------------- | ------------- | -------------------------------------------------------------------- |
| Deployment target 1 | deployment.js | Must export deployment objects called `deploymentRegistry`,          |
|                     | binaries      | Contained within folder in `deployment` called `deployment_target_1` |

## Populating deployment.js

`deployment.js` contains a declarative implementation of the EKS deployment. Comments in the code block below illustrate this.

```

export const deploymentRegistry = {
containerDestination: '<id>.dkr.ecr.<region>.amazonaws.com',
region: '<region>',
version: 1, // Version tag Docker build. Leaving at 1 will overwrite the previous container.
api: {
awsAccessKeyId: '',
awsSecretAccessKey: '',
},
deploymentObjects: [ // Declare all objects here
{
title: 'Object title', // Used only in the CLI for descriptive purposes
label: 'object-ecr-label', // Label of both the ECR registry and the built item
folder: 'object_folder', // `hephaestus-deployment/deployment/deployment_target_1/<folder>`
},
{
title: 'Object title 2',
label: 'object-ecr-label',
folder: 'object-folder',
git: 'git@<git address>', // Optionally clone a git repository
gitFolder: 'gitFolder/docs', // What is the git folder called? i.e. `hephaestus-deployment/deployment/deployment_target_1/<gitFolder>`
},
};

```

## Simple deployment object folder structure

Presuming there is a package called `MyDockerisedContainer` that is to be build, tagged and pushed to the ECR on AWS

1. In `deployment.js`, ensure that the `containerDestination`, `region`, `api` fields are filled in.
2. In `deployment.js`, add an object in the deploymentObjects array as such

```

export const deploymentRegistry = {
...
deploymentObjects: [
{
title: 'MyDockerisedContainer', // Used only in the CLI for descriptive purposes
label: 'mydockerisedcontainer', // Label of both the ECR registry and the built item
folder: 'mydockerisedcontainer', // `hephaestus-deployment/deployment/deployment_target_1/mydockerisedcontainer/`
},
]
}

```

3. Inside root of the cloned repo create a folder called `deployment`.
4. Inside the `deployment` folder, create a `deployment_target_1` folder
5. Inside the `deployment_target_1` folder, create a folder matching the object we defined in step 2, i.e. `mydockerisedcontainer`
6. In `deployment/deployment_target_1/mydockerisedcontainer/` we must have, at least:

- A Dockerfile, which will be built, tagged and pushed
- Any files the Dockerfil refers to.
- A deployment.yml file, which will he used to declaratively create a kubernetes object using `aws-cli`

## Example 01-deployment.yml

Below is an example of the file, i.e. `deployment/deployment_target_1/object/01.deployment.yml`. The script will automatically populate `spec.containers.image`, `spec.containers.name` values.

```

apiVersion: apps/v1
kind: Deployment
metadata:
name: mydockerisedcontainer
spec:
replicas: 1
selector:
matchLabels:
app: mydockerisedcontainer
template:
metadata:
labels:
app: mydockerisedcontainer
spec:
containers: - name: mydockerisedcontainer
image: <id>.dkr.ecr.<region>.amazonaws.com/mydockerisedcontainer:v1
ports: - containerPort: 80

```

## Advanced deployment options

### Cloning directly from git

The deployment object in `deployment.js` can contain a git repo. This will be cloned. You must specify both the git address and the folder it will clone into.

```{
      title: 'My Git Hosted Container',
      label: 'git-container',
      folder: 'git-container-folder',
      git: 'git@<gitaddress>.git',
      gitFolder: 'git-name',
    },
```

### Exposing on LoadBalancer

After the build phase, Hephaestus will prompt to expose on LoadBalancer. If so, a file titled `02-load-balancer.yml` must be in the deployment object folder, i.e. `deployment/deployment_target_1/mydockerisedcontainer/02-load-balancer.yml`

An example of this file is provided. The spec.selector.app must match the ECR name of the registry

```
apiVersion: v1
kind: Service
metadata:
  name: mydockerisedcontainer-loadbalancer
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: "nlb"
spec:
  type: LoadBalancer
  ports:
  - port: 80
    protocol: TCP
    name: tcp-80
    targetPort: 80
  selector:
    app: mydockerisedcontainer
```

### Exposing on NodePort

After the build phase, Hephaestus will prompt to expose on NodePort. If so, a file titled `04-node-port.yml` must be in the deployment object folder, i.e. `deployment/deployment_target_1/mydockerisedcontainer/04-node-port.yml`

An example of this file is provided. The spec.selector.app must match the ECR name of the registry

```
apiVersion: v1
kind: Service
metadata:
  name: mydockerisedcontainer-nodeport
spec:
  type: NodePort
  selector:
    app: mydockerisedcontainer
  ports:
    - protocol: TCP
      port: 80
      targetPort: 80
```
