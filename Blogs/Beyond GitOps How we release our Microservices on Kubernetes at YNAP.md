# Beyond GitOps: How we release our Microservices on Kubernetes at YNAP

In recent posts I have talked about our adoption of Kubernetes, in this post I’m going to talk about how we release our applications into our cluster.

I recommend making a brew because we are going down the rabbit hole, as before I even start, I think I need to answer an important question.

## Why Kubernetes?

![](https://miro.medium.com/max/1400/1*pP1j9qLatEenSLXESFFS_g.png)

I think the best answer to this can be found within the comic [“Smooth Sailing”](https://cloud.google.com/kubernetes-engine/kubernetes-comic), but we have all been given the sales pitch, I want to give you a real world example. Why did the YNAP frontend team adopt Kubernetes?

It all came about during the Mr Porter re-platforming. The new frontend architecture was built around Microservices each handling a different part of the website. Each application had their own pipeline to terraform the infrastructure and environment; another pipeline for build, test and deployment of a Docker image to ECR and finally a third pipeline to deploy the image to Elastic Beanstalk.

This solution allowed us to have infrastructure as code, build the first full stack development environment and it matched the SRE requirement of separating our builds from deployments…

### So, what’s the problem?

From the day we implemented this solution and got it all wired up, it worked but creaked, _badly_. Some of the issues we had encountered were:

-   Environmental variables were coupled to infrastructure not applications
-   Huge over provisioning of server resources — even a small EC2 is plenty for a dev environment with very low traffic
-   We wanted to allow each team to have autonomy but with interconnected Microservices, developers would have to provision the infrastructure first, then once the environment was ready create a pull request setting all environmental variables required in all the other applications it needed to talk to. This made complete automation without a manual process impossible*
-   Our project for nine Microservices now had 27 Git repositories, each having infrastructure, build and deployment pipelines. We wanted developers to feel free to spin up services as and when they needed them and this process did not scale. That led to a fixed number of environments that needed to be shared
-   Releases were not only taking too long but because of our blue/green deployment strategy they needed to be actively monitored. There would be user prompts waiting for certain inputs, meaning whoever was overseeing the release would lose around an hour per deployment
-   As a domain got in a position to deploy their application, they would improve the pipelines, resulting in each deployment process being slightly different
-   This process required a huge cognitive load, an awareness of every service required and was very time consuming. If we ever needed to do this in a disaster recovery scenario, you’d pray for the people involved

The environments were flaky, deployments were slow and it took us two weeks to get up and running but we had our first full end-to-end development environment.

The real problem came within the following month when we were asked to build the production environment, and another six development environments. We went back to our delivery manager and said forget about feature development we are now full time building environments.

A few engineers had been looking into Kubernetes in their own time and were inspired by a talk on [Jenkins X](https://jenkins-x.io/) hosted at the [Tech Hub](http://www.ynap.com/pages/careers/tech-hub/). This prompted an investigation into a potential solution for our requirement of being able to spin up full stack environments on demand with minimal effort.

After a few meetings and PoCs, we managed to get enough buy-in to start a small cross collaboration team with CI/CD, SRE and the Mr Porter Frontend to investigate what was possible.

## Kubernetes at YNAP

The early days of Kubernetes within YNAP were about experimentation and seeing what worked for us, but very early on knew we wanted to focus on the following:

-   Being declarative, with everything represented as code
-   Having Fast, scalable and replicable deployments
-   Efficiency with respect to; resource utilisation and cost optimisation
-   Observability

We settled on using [Terraform](https://www.terraform.io/), [EKS](https://aws.amazon.com/eks/), [Helm](https://helm.sh/) and, quite a risky choice at the time, [Istio](https://istio.io/) (still in v0) as a service mesh. I will write a more in-depth look at our Kubernetes implementation in the future, about how we got there and how it looks now but for this post I want to talk about deployments.

### GitOps

At the of start of this project we were not really aware of [GitOps](https://www.weave.works/technologies/gitops/) as a concept, but on other projects we had used already used Git as a workflow for a simple CMS. Git gives you an authority of truth, permissions and an audit trail of changes out of the box, so when we saw [Weaveworks](https://www.weave.work) [Flux](https://github.com/fluxcd/flux) it totally clicked, this was exactly what we wanted to achieve.

![](https://miro.medium.com/max/1400/0*VYGuVhpTIUsmXMr6.png)
<sub>[Flux architecture](https://github.com/fluxcd/flux)</sub>

With Flux you have an operator inside your cluster monitoring git for changes then applying them via the Kubernetes API. [Weaveworks](https://www.weave.work) have done an amazing job and now Flux has joined the [CNCF](https://www.weave.works/blog/flux-joins-the-cncf-sandbox) which is great news. When we started the project however there was a concern around a connection between our cluster and our CVS. We were already proposing a large change to our company planned architecture, one we were still not sure we could land, so we couldn’t afford to also open too many cans of worms. Unfortunately adopting Flux was at this point of time was out of the question.

We did however take huge inspiration from Flux but wanted to move from a pull to a push system and taking more advantage of our build tools. Instead of an operator pulling in changes, when code is pushed to Git we would have Jenkins pipelines and a docker image responsible for applying changed to Kubernetes. We broke deployments into two types, application deployments and what we call “full stack deployments”.

**Application deployments**

When an applications branch is built we create a [Docker](https://www.docker.com/) image, tag it with a [semantic version](https://semver.org/) (include the branch name if it’s not the main branch), publish the image to [ECR](https://aws.amazon.com/ecr/) and a [helm chart](https://helm.sh/docs/developing_charts/) to our own private [S3](https://aws.amazon.com/s3/) helm repository.

![](https://miro.medium.com/max/1400/0*iZx-1gwAYt_Cxai_.png)
<sub>How we deploy an application to a development environment</sub>

Application development environments are also configured within the applications repository. When the publishing of the image and the [helm chart](https://helm.sh/docs/developing_charts/) is complete, the pipeline looks to spin up the newly developed application version on the cluster. The pipeline does this by creating an “[umbrella chart](https://helm.sh/docs/howto/charts_tips_and_tricks/#complex-charts-with-many-dependencies)” with any number of the just published helm chart as dependencies. This allows the application repo to define any number of configurations for the application to be deployed in for this development environment.

The end result is spinning up any number of pods for every branch/pull request. Other than main branch these helm releases are deleted every 2 hours or on a merge to the main branch. If the developer wants it to stick around for longer they have the option to control that in the application Helm chart.
```
---  
global:  
# Configure the environment to expire, if not master  
  ((- if eq .Env.BRANCH_NAME "master" ))  
  expires: false  
  ((- else ))  
  expires: true  
  # Defaults to now + 2hours  
  # Format: "YYYY-MM-DD hh:mm:ss"  
  expiryDate:  
  ((- end ))
```
This means we are creating and deleting hundreds of pods on a regular basis.

**Full stack deployments**

![](https://miro.medium.com/max/1400/0*_0RI7mRWyLk0_Z0z.png)
<sub>How we deploy applications to a full stack environment</sub>

Application deployment environments are useful for testing a service in isolation, but we also need to test all the services integrated, routing rules and internal networking.

For this we have full stack environments, each having their own repo and helm charts and using the same umbrella chart approach — this time with different applications as dependencies. These charts reference semantic versions of application charts previously pushed to S3 by the application deployments.

When a developer wants to release an application within a full stack, we use the [GitOps](https://www.weave.works/technologies/gitops/) methodology, using the [semantic version](https://semver.org/) tag to update a `YAML` configuration within the helm chart.

![](https://miro.medium.com/max/1400/1*zKnDEGKgQhS_ArzbnE_-Ag.png)
<sub>Bumping the version of an application</sub>

Once a pull request is opened our pipeline fetches and merges all of the application sub charts from S3 and apply this full stack chart to [Kubernetes](https://kubernetes.io/). This will trigger the images to be pulled from [ECR](https://aws.amazon.com/ecr/) and deployed to a self contained namespace following the standard convention:
```
{repository-name}-{branch-name}
```
Once this is merged with main branch, Kubernetes will apply the difference from the branch environment to the main branch environment - that’s how a like-live full stack branch-environment becomes a live full stack environment.

### Problem solved?

If we look at our problems from our earlier solution in Elastic Beanstalk they have all been solved and we have new powerful tools and processes to help us develop, test and deploy much faster.

-   Environmental variables are now decoupled from infrastructure, applications and stacks are in control of their configuration
-   Our Mircroservices communications are all orchestrated for us, the developers don’t need to worry about plumbing things together
-   We no longer need infrastructure and deployment pipelines replicated
-   We have centralised all the tooling in every application, being more opinionated allowed us to have a more predicable stack
-   Deployments become a much more of a fire and forget process, whoever released an application didn’t need to actively monitor it
-   Creating a new environment is as simple as forking a repo

Our new tooling now allows for developers to spin up development instances with a pull request. They can also do the same for an existing full stack environment. Here we can run a site automation smoke test on a like-live full stack before merging to the main branch in less than 10 minutes. We had not only improved deployments but they were helping us catch any cross-application regressions.

In fact, we not only do that on every release but every night we automatically provision an entire cluster from scratch, deploy an environment, run a simple automation suite, and then tear it down, this gives us an idea how long a cluster disaster recover would take.

![](https://miro.medium.com/max/736/1*N4Tlp91GYoXNMgwHVQWyUA.png)
<sub>Spinning up a new cluster and testing it over night</sub>

If any team now wanted a whole new environment it took us less than 5 minutes, a large improvement from the first one which took us two weeks.

Perfect! Job done, back to working on features for our customers? Not quite… while the rest of the frontend team had been flying, releasing multiple versions of our applications per day, helping the back end teams manage their releases had become a bottleneck. The teams who requested full stack environments for testing backend services couldn’t keep up with the rate of changes. They didn’t know what was exactly being released into the environments, they might be waiting for fixed versions for their testing or didn’t know how far behind the latest versions the applications in their environment were.

Managing the helm charts, bumping versions, creating release notes and distributing them was becoming a full-time job.

## Enter Slipway

Releasing our applications required someone with Git experience and an understanding of what was in each semantic version. Our frontend delivery manger took this on, but it was a thankless task, upgrading applications and informing other teams of releases for 7 development environments and one currently _unused_ production environment.

### Proof of concept to first iteration

Frustrated with this process, one of our developers took a two day hackathon to try to solve the problem with some custom tooling. After winning most ambitious hack the working prototype proved it had potential and would be worked on during our 10% time until it was released to the frontend community.

We didn’t want to move away from GitOps — we just wanted to make it more accessible.

![](https://miro.medium.com/max/1400/1*sKd9b5TWCz6FVFOSK4YpSQ.png)
<sub>The state of our full stack environments</sub>

At a glance, without looking in multiple repos and `YAML` files, anyone with access could see the state of all our stacks. We could see every Microservice, what version was running and what the latest available version was. We wanted to encourage backend teams to take the latest version so the shade of red used got darker as the version got further behind.

![](https://miro.medium.com/max/1400/1*A6Ru3O5mBCgtaoVCyxZd9A.png)
<sub>Upgrading a full stack environment</sub>

Clicking though to an environment you had the option of creating a pull request to the Helm chart of the relevant repository. Now anyone who wanted to upgrade or rollback an application in a stack could do it without any experience of Git.

![](https://miro.medium.com/max/1400/1*y5WmJH-Clo7d1ur-CWLSmg.png)
<sub>You could view an applications Git change log</sub>

Viewing the applications change log would give the user an idea of what go into that release. Once they where happy they could generate a pull request.

![](https://miro.medium.com/max/1400/1*kfl0BJIe8v9VRCZ4ERohjA.png)
<sub>Slipway raising a Pull Request with what has changed</sub>

Previously developers manually bumped application versions within helm charts, now Slipway did it for them. We retained all of the benefits of GitOps but democratised the process on requesting a change. Anyone within the company with access could raise a pull request to release a change but only certain users had the access rights to merge the changes and those gatekeepers could be different per environment.

## Slipway v3 and multi-brand adoption

We are currently on version 3 and it is now handling releases for:

-   [NET-A-PORTER](https://www.net-a-porter.com/)
-   [Mr Porter](https://www.mrporter.com/)
-   [The Outnet](https://www.theoutnet.com/)
-   [YOOX](http://yoox.com)

v1 was a huge step forward but not without problems, it was slow and unstable. Regardless of these issues, the application adoption was much quicker than we imagined, teams moving away from standard GitOps Pull request model to using Slipways UI as soon as it was available. Once Slipway was released, a lot of time was spent nursing the application, with a developer almost full time supporting issues. We needed to invest more time on Slipway, taking it to almost the same standard we would with a customer facing application.

The next few months we would focus on:

-   Making it more stable (with improved error handling)
-   Performance
-   A proper (re)design
-   Lots of new features

![](https://miro.medium.com/max/1400/1*sIiv-BnlJLj47gcN6tebHA.png)
<sub>Slipway v3</sub>

**New UI**
v1 of Slipway was purely functional, we didn’t worry too much about the UX/UI but as we wanted to offer this to a wider audience we wanted to give it a bit more polish. We decided as the environments were now managed by different teams there was no longer value in the overview of all the stacks at once, so we removed it. This was replaced by a left hand navigational bar containing the different environments. The change also gave us more room to expand the number of services included, this was important as teams were looking to add more and more.

Application upgrades work in the same way as before but now we use badges with a traffic light system to warn about applications slipping behind.

We used [ant.design](https://ant.design/) for the UI components, which is now becoming our design language for a lot of internal developer tools, if you have not used we strongly recommend you give it a try.

**Rollbacks**
We as a frontend team encourage rolling forward but that is not always possible and we want Slipway to be adopted throughout the company so we need to support different strategies.

![](https://miro.medium.com/max/1400/1*DHMulvkQYU-Uajsy6LdMgQ.png)
<sub>Rolling back to a previous release</sub>

![](https://miro.medium.com/max/1400/1*B9Mp33U1Rtvazx8cGf_nrg.png)
<sub>You could be rolling back multiple applications so the user gets a warning

While in an emergency you can use a Helm rollback using the following command:
```
helm rollback <RELEASE> [REVISION] [flags]
```
GitOps means your code should be the the authority of truth, this command will mean the stack is now out of sync with your repo.

This feature gives the user a drop down of different releases, a commit hash and when it was merged into the main branch.

By selecting one of these the user is indicating they want the stack to be in the same state as this commit. Once they have selected a commit hash they are given a confirmation with all the applications that will roll back and to what version.

This will create a PR that will need to be approved and follow the standard GitOps model. We did consider a force push into the main branch to trigger a rollback faster but it was deemed too risky and would tamper with the full Git history.

**Creating pull requests**

Like v1 of Slipway the latest iteration still generates a pull request with the Helm chart updates but we have added some improvements.

![](https://miro.medium.com/max/1400/1*j8k7uBlHxmES2W0YN7HvDw.png)
<sub>Slipway releasing some simple application change tickets</sub>

Slipway pull requests now included the following:

-   A link to the freshly created full stack environment to see your new like-live environment
-   For Each app that is being deployed, the version change and a link and description of all the tickets included
-   Link all of the Jira tickets to the pull request

![](https://miro.medium.com/max/1400/1*a86Bv_5AZi2SBAutjZicmw.png)
<sub>Jira tickets assigned to the release</sub>

The environment repository includes recommended reviewers but we also wanted to make it easier to track change requests:

![](https://miro.medium.com/max/1400/1*2tecIfsn-IPdgJoiuQ_sGQ.png)
<sub>Slipway Slack integration</sub>

When Slipway creates a pull request it pushes a message into the relevant Slack channels with a link to the pull request, the Jenkins build, the newly created full stack environment and what applications have changed.

![](https://miro.medium.com/max/1044/1*0jKbh3hGuj7lf1R4E9rHvw.png)
<sub>Slipway pull request has been merged</sub>

Once this pull request has been merged and released a final update is sent out to let our release channels now what went out and when.

**Extended Jira integration**
As well as helping people release applications, something else we wanted to improve was our delivery manager’s workflow. They wanted an easy way to track exactly what was in every release but also wanted to handover the management of development stacks to the relevant backend teams.

With our Jira integration teams are able to take updates when they want and also see exactly what changes are going into their releases. They can even track through the individual tickets commits to see exactly what lines of code had changed on a specific semantic version of our applications.

![](https://miro.medium.com/max/1400/1*PTkKvqEI9nEz-Z3VIdvc3w.png)<sub>Application’s Jira quick-view</sub>

Clicking quickview now opens a drawer with all of the Jira tickets that will be included from this version upgrade, clicking one will take you to the ticket itself. Slipway will group together all of the Jira tickets related to an application upgrade as long as developers prefixed their Git comments with the ticket:
```
$ git commit -m "JIRA-123: my commit message"
```
Slipway will also collect together tickets to build a fixed release within Jira.

![](https://miro.medium.com/max/1400/1*-UJLTRE0Ukh01Jin2wLNdA.png)
<sub>Up and coming releases tagged by Slipway</sub>

![](https://miro.medium.com/max/1400/1*NsXXQzQXLXBwKmbKZhKVZQ.png)
<sub>Release for a Slipway fixed version</sub>

![](https://miro.medium.com/max/1400/1*SUqv_JZrRdHCUsR5mkVqQA.png)
<sub>Ticket and all the fix versions associated</sub>

![](https://miro.medium.com/max/1236/1*IRQrz12XjDx4CkXcQKLIdA.png)
<sub>Jenkins commenting on the ticket with a link to the newly created environment</sub>

Fixed versions will let delivery managers track the progress and velocity of releases.

When a Slipway pull request is created all the relevant Jira tickets associated for each application are collected and a release version created.

The version has its name generated from the application, the environment, the date of the creation and the application semantic version.

Once the pull request has been merged to the main branch this triggers a deployment, all the Jira tickets in that fixed version are marked as done.

With our Microservice architecture and a potentially unlimited number of environments it can be hard to track the status of a single ticket. Tagging the fixed version with every release we have an audit trail of where a ticket is at any time.

One of our delivery managers gave me the following feedback around the how this improved their workflow:

-   Allows for cross referencing between tickets, release dates and release versions within the same tool, removing the room for manual user error
-   Saves at least 10–15 minutes per release (we have multiple per day) which was previously spent collating manual release notes
-   Streamlines approach for release notes across all applications

**Monitoring integration**

![](https://miro.medium.com/max/1400/1*ahufc2eUPyp7D-byKMaMoQ.png)

With Slipway we wanted to make people’s lives easier when releasing software. This starts with helping create pull requests with GitOps but takes you all the way to monitoring the release in production. Every Microservice registered with Slipway you will get a link to a Grafana dashboard.

The dashboard will give you everything you need to monitor and understand the impact the release has had, the relevant application will be toggled but all the other services are there just incase you want to overlay them.

![](https://miro.medium.com/max/1400/1*Jkz3STdNcweMv5J2tVy-Vw.png)
<sub>Application traffic shown with release annotations</sub>

Every release is annotated on the dashboard so at a glance you can see everything that’s been deployed on that cluster’s environment namespace and the application’s semantic version. This ties our GitOps approach all the way from build, deployment to our monitoring tools which really helps when triaging an issue.

If there is a production issue someone from SRE can see every release, find the release commit hash, find what Jira tickets that were included and from there see every code change included.

### What’s coming next to Slipway

Slipway is now a pretty established tool internally and has paved the way for the frontend internal tooling. There are some minor things we want to look at like better mobile support and a service worker for improved loading times but there is one big topic we are excited about that will hit with v4.

Those who looked very closely at Slipway UI you might have seen it references creating experiments. We are currently spiking Slipway being able create experimental full stack environments to release application variants for server side rendered A/B tests and canary releases using GitOps.

This is currently still a proof of concept but once it is battle tested there will be a post about that coming.

## And That’s a wrap

In this post I am really standing on the shoulders of giants; our deployment process is only possible because of our implementation of Kubernetes.

This project has been a collaboration of some incredible engineers all with a shared vision. From the beginning we a clear goal; making it easier and faster to release applications. When creating internal projects the users of the solution are your colleagues and sometimes that can be forgotten even when they are so much closer to you than your customers. Having a cross-competency team can really help solve that problem and that was the real key to our success. It allowed us to keep focus on the main goal but bringing in concerns from other departments as required.

-   **Infrastructure**, repeatable infrastructure all stored as code
-   **SRE**, improved stability and observability
-   **CI/CD**, consistent build, test deploy pipelines
-   **Application Developers,** easy and fast deployments with full like-live environments on demand

The solution and architecture came organically from the bottom up. It was a true agile project with features were added to the platform as they were needed day by day.

As a team we decided we wanted to adopt GitOps as our philosophy and this is something that has become a standard within all the teams using our Kubernetes cluster. We owe a lot of this mindset to [Weaveworks](https://www.weave.work) and their work with [Flux](https://github.com/fluxcd/flux), this was a huge inspiration to us and we follow their work in the Kubernetes community closely.

If we were starting a fresh would we use Flux? possibly.

With Flux becoming part of the CNCF it becomes closer to being the industry standard way of releasing applications to Kubernetes. This makes recruitment and most importantly onboarding new people much faster. This could be another way to lower the barrier of entry for new team members.

However one of our key features is based around dynamic environments, we spin them up and down on demand based on branches, merges and on a time to live which is configured in our Helm charts and timestamped in our build pipelines. This is something we took inspiration from Jenkins x and merged with [Weaveworks](https://www.weave.work) GipOps philosophy but to our knowledge something that is not currently not available in Flux.

The good news is, all of the patterns and tools we have designed are still based around a similar architecture to Flux. We have already been working with [Weaveworks](https://www.weave.work) and hopefully taking some in some of our requirements moving from our push approach to a pull one should be possible in the future.

I would love to open source Slipway but it is very tightly coupled to the YNAP frontend team’s toolchain and ways of working. However I hope this article inspires you to think about if Kubernetes is right for you and how you can take GitOps with or without Flux to fit your needs.

-   _Impossible is a lie, it was just difficult. In the past we used Cloudformation to do this kind of orchestration but it bred a monster of configuration which took around an hour to complete a deployment. This was 5 years ago, you may have more luck with this approach in 2020._
