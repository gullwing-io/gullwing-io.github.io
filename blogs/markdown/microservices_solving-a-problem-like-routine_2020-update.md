


# Microservices: Solving a problem like routing — 2020 update

Well, where did those last two years go? Apologies for my tardiness, time really got the better of me. The good news is, we’ve had a further two years of production experience, improving performance, catching bugs, adding features and completely changing our infrastructure.

In the final part of this series I’m going to run a retrospective on Locer (**Loc**alisation, **E**rrors and **R**outing), what went well, what we had to improve and what I would do differently.

If you have just come into this series I recommend catching up on [Part 1](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-part-1-8e48d789e57) and [Part 2](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-part-2-e197cdd1863c) first.

# What went well 😃

Locer is now routing frontend requests for the following brands:

-   [Mr Porter](https://www.mrporter.com/)
-   [The Outnet](https://www.theoutnet.com/)
-   [NET-A-PORTER](https://www.net-a-porter.com/)

It is currently handling an average of half a billion requests a month.

## Node

In the conclusion of [Part 2](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-part-2-e197cdd1863c) I discuss why we selected [Node](https://nodejs.org/) over [Go](https://golang.org/). There were two main factors in selecting JavaScript:

**Contributors**
We wanted to make sure developers felt free and empowered contribute to the project. While Go is growing within the company, (thanks to [Kubernetes](https://kubernetes.io/)). The team that would use Locer day-to-day are mainly using JavaScript. We wanted to keep the language and tools familiar to eliminate context switching.

Locer has now had 23 different contributors to the core codebase along with 43 submitting changes to configuration and new routing rules. I considered this a huge success.

**Performance and scalability**
We knew Go would outperform Node but we wanted to make sure our language selection would not become a bottleneck. We needed to ensure the application itself added as little overhead as possible while proxying requests and also following the requirements set out in [Part 1](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-part-1-8e48d789e57).

![](https://miro.medium.com/max/700/1*Qin2XUn7ETCF4RLgYQL4_A.png)<sub>
Locer production averaging 178ms response time over 24 hours
</sub>
We know through both [Jaeger](https://www.jaegertracing.io/) and and also [server timing headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing#:~:text=The%20Server-Timing%20header%20communicates,or%20in%20the%20PerformanceServerTiming%20interface.) how much time of a request consists of network responses from an upstream service and how much is Locer itself.

![](https://miro.medium.com/max/528/1*TGlJtI9uSt2WYYou52Dzew.png)

Service timing headers for a product listing page

This example trace shows that Locer called the product listing application, which fetched some data and rendered a response. Locer received this response and added only 1.55ms of processing time. We allowed a budget of 5ms for this processing and so far Locer has remained under it.

Since the majority of work is asynchronous with a computation time of less than 5ms, we’re able to run a relative low number of instances and handle all of our traffic through one node application.

**Thoughts on Node** 
Something that has been really amazing to see since we released Locer is whenever Node releases a new version into [LTS](https://nodejs.org/en/about/releases/) it became much more efficient.

While we could potentially save money on operational costs if the application was written in Go, we saved on engineering costs opting for JavaScript. Over time those savings will decrease but we are still very happy with our choice. It’s also worth considering that when the cost saving intersect, we may already be in the position of evolving our architecture again.

## Fastify

As discussed in [Part 2](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-part-2-e197cdd1863c) maximising requests per second with a consistent latency was massively important to the project. [Fastify](https://github.com/fastify/fastify) helped us achieve that.

> Fastify is a web framework highly focused on providing the best developer experience with the least overhead and a powerful plugin architecture. It is inspired by Hapi and Express and as far as we know, it is one of the fastest web frameworks in town.

![](https://miro.medium.com/max/445/1*DUBp6ZvT8NToXApwlfRKhw.png)<sub>
Benchmarks taken using [https://github.com/fastify/benchmarks](https://github.com/fastify/benchmarks)
</sub>
As well as performance there were some other key features within Fastify that we loved.

**Logging**
Within our Node apps we already use [Pino](https://github.com/pinojs/pino) for logging and [Fastify comes with it out of the box](https://github.com/fastify/fastify/blob/master/docs/Logging.md) with it available on the request object.

```
import fastify from 'fastify';

const app = ({  
  logger: true  
});  
  
app.get('/', options, (req, res) => {  
  request.log.info('Some info about the current request');  
  reply.send({ hello: 'world' });  
});
```
**Hooks**
[Hooks](https://github.com/fastify/fastify/blob/master/docs/Hooks.md) allow you to listen to specific events in the application or request/response lifecycle. We use them for a range of things: registering redirects, adding [server timing headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Server-Timing#:~:text=The%20Server-Timing%20header%20communicates,or%20in%20the%20PerformanceServerTiming%20interface.) and a really simple example adding a “x-powered-by” to the response headers.

```
import fp from 'fastify-plugin';

export default () => {  
  return fp((app, options, next) => {  
    app.addHook('preHandler', (req, res, done) => {  
      res.header('x-powered-by', 'locer');  
      done();  
    });  
    next();  
  });  
};
```
**Decorators**
The [decorators API](https://github.com/fastify/fastify/blob/master/docs/Decorators.md) allows customisation of the core Fastify objects, such as the server instance itself and any request and reply objects used during the HTTP request lifecycle. Again, you can find decorators throughout the Locer code. We found it most useful when handling errors.
```
app.decorateReply('errorPage', (statusCode, req, res, error) => {  
  req.log.error(error);  
  res.code(statusCode)  
     .type('text/html')  
     .send(`  
           <div>  
              Error: ${error.message}  
              Status code: ${statusCode}  
           </div>  
      `);  
});
```
From there, whenever you have access to the response object (I have used the express naming convention Fastify referrers to it as [Reply](https://github.com/fastify/fastify/blob/master/docs/Reply.md)) you can respond with your error page:

```
import got from 'got';

app.get('/', options, async (req, res) {  
  try {  
    const { statusCode, body } = await got('/api');  
    if (statusCode === 200) {  
      res.send(body)  
    } else {  
      res.errorPage(statusCode, req, res, 'Invalid status code');  
    }  
  catch(error) {  
    res.errorPage(503, req, res, 'Fetch failed');  
  }  
});
```
**Thoughts on Fastify**
We love Fastify! We already had a lot of IP built around [Express](https://expressjs.com/en/starter/installing.html) but the great news was it just worked out of the box with Fastify. If you are looking at a project and have traditionally always opted for Express then consider moving, you won’t be disappointed.

# Where we made improvements 🤔

With any piece of software, you will find things to improve and ways to fine-tune performance over time. Locer was no different, while we tested it rigorously there are some things we didn’t see until it was in the wild.

## Memory and CPU consumption improvements

As part of keeping our costs down and the application stable, we were constantly looking to improve its performance within our cluster. One of the biggest contributors to that were the [V8](https://v8.dev/) improvements on Node releases, but here are some additional changes we made that could help you.

**Fastify requesting buffers and returning promises**
When the project started we were always inspecting the response from our services to understand how to handle the request. This added a large overhead of having to process large HTML responses. Fastify however allows lets us to deal with [buffers](https://github.com/fastify/fastify/blob/master/docs/Reply.md#buffers) and [promises](https://github.com/fastify/fastify/blob/master/docs/Reply.md#async-await-and-promises) as responses. This change massively improved our application’s CPU usage.

![](https://miro.medium.com/max/700/0*T-BRsXnDKRPZ9Ooo)<sub>
CPU core usage is almost halved
</sub>
![](https://miro.medium.com/max/700/0*O-zoHBWbD9WWsZAY)<sub>
With the CPU defining out scaling — we are now running half the replicas
</sub>
This change also meant we could also now proxy other types of requests like ones for images.

**Tuning your Docker image**
We spent a long time tuning our Docker images with multi-staged builds and the correct base image for what we needed. We managed to go from over 800mb to around 100mb.

For a good explanation on how you can do this, read this great article:  
[3 simple tricks for smaller Docker images](https://learnk8s.io/blog/smaller-docker-images)

One change from this article though - when starting your image don’t do it from the scope of NPM or YARN but from node itself.
```
CMD ["node", "index.js"]
```
[This can save you an additional 70Mb of RAM](https://twitter.com/iamakulov/status/1030904826505375744).

## Service readiness

One of the problems we encountered when moving to Kubernetes and [Istio](https://istio.io/) (our [service mesh](https://itnext.io/istio-service-mesh-the-step-by-step-guide-adf6da18bb9a)) was around boot time dependencies. Locer needs to call our country service before it can serve traffic - this is how it can validate locales in URL patterns. The problem was that since Locer started so quickly, the call would happen before the [Istio sidecar](https://istio.io/latest/docs/reference/config/networking/sidecar/) was available to handle network requests.

This meant the application would start and, due to the [healthcheck endpoint](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) being available Kubernetes would add it to the pool of available pods. The boot time dependency would fail as Istio is not ready and therefore application would be in a stuck state receiving requests it could not process. We solved this in two ways:

**Boot dependency retries**
When the app started, if it failed to fetch from the country service it would use a retry with an exponential backoff. This would allow the Istio sidecar time to start and handle our requests.

**Readiness endpoint**
Previously we were only using healthcheck endpoints which meant we started allowing traffic straight away. We now had an endpoint that would return a 5xx until country service had been successfully fetched. This would then set the response to a 200 letting Kubernetes know Locer was ready to accept traffic.

# What I might do differently 💡

While we are very happy with what we have, if I was starting now based on the direction our architecture took and the industry has moved, there are a few things I might do differently.

During its inception and to production we were running all of our Microservices in [ElasticBeanstalk](https://aws.amazon.com/elasticbeanstalk/). Once Locer was up and running it became apparent our infrastructure did not scale in the way we wanted, so myself and a small team started investigating moving the frontend to Kubernetes. We wanted ease of deployments but also wanted to include a service mesh for observability, so it was agreed our new infrastructure would include both Kubernetes and Istio together.

While Locer still worked within this architecture it also introduced some complexity when we started to build serverside A/B testing. Istio has the concept of [traffic management](https://istio.io/latest/docs/concepts/traffic-management/) which allows you to do things like load balancing, weighted traffic (A/B) and canary releases. Here is an example of weighted routing rules:
```
apiVersion: networking.istio.io/v1alpha3   
kind: VirtualService metadata:     
name: reviews  
spec:     
  hosts:  
  - reviews  
  http:     
  - route:       
    - destination:           
        host: reviews           
        subset: v1         
    weight: 75  
    - destination:           
         host: reviews           
         subset: v2         
    weight: 25
```
This would mean 75% of customers get the _control_ application and 25% get the experimental _variant_.

We could could apply these conditions to individual microservices, giving teams the power to run multiple versions of an application with Istio doing all the routing for you.

Where does Locer come into all of this? Well if you think back to the original architecture diagram.

![](https://miro.medium.com/max/700/0*lRK1FeZFBVDwuuEf.png)<sub>
Routing our Microservices architecture in 2018
</sub>
Locer is the ingress for all the microservices, the configuration that matches request to a service is shipped as a [helm chart](https://helm.sh/):
```
localised:  
  homepage:  
    route: /  
    service: http://((.Env.RELEASE_NAME))-homepage
```
The problem is we now can’t use istio-ingress-gateway to select which virtual service a request should go to as Locer is effectively hardcoded to one service. So, any service behind Locer will miss-out on the powerful traffic management within Istio.

You might be thinking, then remove Locer and let Istio handle routing? This makes sense until you revisit our original requirements:

1.  **Localisation** — If the URL was not localised, add a brand specific localisation pattern to the URL and `302` the customer to that new URL
2.  **Routing** — based on the inbound URL, proxy the request to the correct Microservice
3.  **Serve errors** — if the proxied request returned either a `4xx` or a `5xx` let the routing tier send the correct error page in the correct language
4.  **Catch all** — If for some reason the inbound URL doesn’t match a pattern for a Microservice, try and return them some relevant content

It’s not just routing that is required, we also need some scripting and the ability to test the code.

## Introducing WebAssembly into Envoy and Istio

In [March 2020 it was announced](https://istio.io/latest/blog/2020/wasm-announce/) we would be able to extend envoy proxies and run them as sidecars using [WebAssembly](https://webassembly.org/).

![](https://miro.medium.com/max/700/1*Ue3QYVBT4JApyBa4Yk-HMg.png)<sub>
Locer could now sit within the envoy proxy sidecar
</sub>
This would essentially allow Locer to move from an ingress to sidecar for every microservice. We could then take advantage of the Istio advanced traffic management throughout the stack and not just on Locer.

This change does look really tempting as it would align us closer to the service mesh architecture. To create a wasm module, you need a language where you can compile a garbage collector into a binary. Certain languages, like Scala and Elm, have yet to compile to WebAssembly but we can use C, C++, Rust, Go, Java and C# compilers instead.

As mentioned before this application is used and owned by the frontend teams and we wanted to use JavaScript to take advantage of their knowledge in the ecosystem and to avoid context switching. So what is most interesting for me is [AssemblyScript](https://github.com/AssemblyScript/assemblyscript).

This would allow developers using [Typescript](https://www.typescriptlang.org/) to migrate Locer into an envoy sidecar proxy while retaining their existing development and testing toolchain.

# Conclusion

All of the original requirements for Locer were delivered and lots of new powerful features were added over the last two years. Frontend developers are now empowered to own and change routing rules with confidence. Most importantly it has never been the cause of a P1 issue. It reliably responds to every request for three large websites while also being cheap and performant.

Since it’s been live, our standards along with the industries standards and demands have changed and Locer in its current incarnation was not built around the service mesh architecture. The thing to remember when writing software is that’s ok, things change and move forward and it’s important to not be too precious or egotistical about code - it solves a problem for that moment in time you need it to and when it’s right to change you should embrace that.

I can’t say what the future holds for service mesh as a technology but looking at it, moving Locer into a sidecar using WebAssembly does seem the right decision. However the technology is still VERY new, I would like to see the direction it goes in and we do not have a need or requirement to transition as of yet.

We have a solution for A/B testing without using Istio’s weighted traffic management (Something I will write about soon), so for now, Locer will live on using Node and we couldn’t be happier with it.
