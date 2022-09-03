# How we built a service worker for our micro-frontend

Over the last year we have been building the new [MR PORTER](https://www.mrporter.com/en-us/) website (currently available in many of our markets) and [THE OUTNET](https://www.theoutnet.com) on our new brand-agnostic [micro-frontend architecture](https://martinfowler.com/articles/micro-frontends.html).

![An overview of our frontend architecture](https://miro.medium.com/max/1400/0*cMSPfkcfEZPzOhGn.png)<sub>An overview of our frontend architecture, taken from a previous article: [Solving a problem like routing](https://medium.com/@robinglen/microservices-solving-a-problem-like-routing-part-1-8e48d789e57)
</sub>
Although we had not done a complete discovery phase around [Progressive Web Apps](https://developers.google.com/web/progressive-web-apps) we knew [service worker](https://developers.google.com/web/fundamentals/primers/service-workers) offered us features we could rollout iteratively.

We started with the goal to use service worker to improve our performance metrics. We would do this in multiple ways:

-   Caching `css` and `js`
-   Improve third party script caching
-   Using [app shell](https://developers.google.com/web/fundamentals/architecture/app-shell) architecture to cache `html`
-   Use [navigation preload](https://developers.google.com/web/updates/2017/02/navigation-preload) to improve the performance of the service worker itself

# Business and architectural requirements for our service worker

If we were going to implement a service worker we had some key business and architectural requirements we would need to make sure we could support.

## Micro-frontend architecture

Our frontend is designed around our different customers user flows:

**Commerce**

-   My account
-   Checkout

**Product**

-   Product listing pages
-   Product details pages
-   Wishlist
-   Search
-   Designer A-Z

**Content**

-   Campaign pages
-   Static pages
-   Editorial content
-   Site furniture

Each of these domains may have multiple servers each with build, test and deployment pipelines. These applications are versioned, each version may have its own variation of assets (`css`, `js`, etc) deployed to infinite multiple environments. We want each team to have complete autonomy without adding a step to manually update which assets they want service worker to cache.

**Application deployments**

When an applications master branch is built we create a [Docker](https://www.docker.com/) image, tag it with a [semantic version](https://semver.org/), publish the image to [ECR](https://aws.amazon.com/ecr/) and a [helm chart](https://helm.sh/docs/developing_charts/) to [S3](https://aws.amazon.com/s3/).

From here we have two different deployment types:

_Application development environments_

![](https://miro.medium.com/max/1400/1*jjk4VGLhwa4Rnk2vb8bXdQ.png)<sub>How we deploy an application to a development environment
</sub>
Application development environments are configured within the applications repo. When the artefact is published to [ECR](https://aws.amazon.com/ecr/) and the [helm chart](https://helm.sh/docs/developing_charts/) to [S3](https://aws.amazon.com/s3/), it will also be pushed to [Kubernetes](https://kubernetes.io/). This will trigger the images to be pulled from [ECR](https://aws.amazon.com/ecr/) and deployed to the relevant pods.

These environments are used for running a micro-service in multiple configurations or spinning up instances for every pull request.

_Full stack environments_

![](https://miro.medium.com/max/1400/1*mbRsiUBaGR7Onst3qzEktA.png)<sub>How we deploy applications to a full stack environment
</sub>
Developer environments are useful for testing a service in isolation, but we also need to test all the services integrated, routing rules and internal networking.

For this we have environment based stacks that have their own repo and [helm charts](https://helm.sh/docs/developing_charts/). When a developer wants to release an application, we use the [gitOps](https://www.weave.works/technologies/gitops/) methodology, using the [semantic version](https://semver.org/) tag to update a `yaml` configuration within the helm chart.

Once this PR is merged to master, the chart is pushed to [Kubernetes](https://kubernetes.io/). This will trigger the images to be pulled from [ECR](https://aws.amazon.com/ecr/) and deployed to the relevant pods.

The reason this deployment pipeline is important for our service workers is how we tie it together with the last step.

**Asset deployments**

Our asset deployments are a lot more straightforward. All of our assets are deployed to [S3](https://aws.amazon.com/s3/), essentially using it like an Artifactory. On every build, no matter if it’s a feature branch or master branch the assets get published there. We can do this because our assets include a hash based on their content, here are some examples:
<pre>
<a href="https://cache.mrporter.com/assets/mrp-2b33587a.js" title="example1">[/assets/mrp-2b33587a.js]</a>
<a href="https://cache.mrporter.com/assets/mrp-d5208199.css" title="example2">[/assets/mrp-d5208199.css]</a>
</pre>
We then have a reverse proxy ([Ambassador](https://www.getambassador.io/)) within [Kubernetes](https://kubernetes.io/) that maps to our [S3](https://aws.amazon.com/s3/) asset bucket. So it doesn’t matter which version of an application is running on any environment the assets are always available.

## Multiple brands sharing technology

One of the goals of the frontend team was to decrease time to market and eliminate repeated effort. However, this makes applications more complicated because they could be (currently) serving three different stores:

-   MR PORTER
-   NET-A-PORTER
-   THE OUTNET

These stores and their supporting teams have their own release cadence, so again we need different environments to be running different assets. This means we need a different service worker for each environment.

## Internationalised website

Our applications need to be available in multiple languages, although some `api` responses are internationalised we still need to ship [message bundles](https://messageformat.github.io/messageformat/) for certain areas like button call to actions.

We don’t want to make an overly bloated client-side app by packaging message bundles with the translations for all the languages we support with the application code. So we generate a translated version of each application:

[/assets/mrp-en-2b33587a.js](https://cache.mrporter.com/assets/mrp-2b33587a.js)

So we need the service worker to only cache the `js` for the language variant of the site they are currently viewing.

# Introducing Woz

Once we collected our requirements it became apparent a `sw.js` file mounted to the root of our website would not work. We started to look into generating service workers based on the inbound request, this gave birth to Woz.

> *Service worker…*
> *SW…*
> *Steve Wozniak…*  
> *Woz…*

A dynamic service worker service build in [Node.js](https://nodejs.org/en/) that would help us solve the requirements mentioned above.

## Micro-frontend architecture

To get around the problem with services having multiple environments, each that could be running a different semantic version, we decided each domain specific application should expose an endpoint stating which assets are currently being used. This would only be available within our cluster:
```
$ curl [http://sample-app/_tools_/assets]
```
This would return the following JSON:
```
{  
  "application": {  
    "name":"Sample application",  
    "id":"sample-application"  
  },  
  "ton": [  
    {  
      "en": {  
        "js":"ton-en-9a52f02a.js",  
        "css":"ton-57bf5cf1.css"  
      }  
    }  
  ],  
  "mrp": [  
    {  
      "en": {  
        "js":"mrp-en-da9f468f.js",  
        "css":"mrp-df414bbc.css"  
      }  
    }  
  ],  
  "common": [  
    {  
      "vendor": "vendor-57fc54c7.js"         
    },  
    {  
      "ynap": "ynap-195b6804.js"         
    }  
  ]  
}
```
All a developer needs to do to register a new application to get asset caching, is add it to the Woz configuration.
```
sw:  
  services:  
    sample-app:  
      manifest: [http://localhost:3000/sample-app/_tools_/assets]
```
When a request comes in for a service worker, we create a promise to fetch all of the required manifests. We then cache them individually based on headers set by the service asset manifest endpoints `max-age`.

## Multiple brands sharing technology

This one is relatively straightforward, we have the brand set as an environmental variable, which we can easily access from Node.js.
```
const { brand } = process.env
```
We use this to filter the required brand from the assets endpoint.

## Internationalised website

We want service worker to only cache assets for the requested language, the first step towards this was to scope service worker using the our localisation pattern:
```
$ curl [http://woz/en-gb/sw.js]
```
Thanks to our approach all our new services have to be localised and follow the same pattern `{language}-{country}`. This means service workers are never for the entire site but only for a language and country locale.

Woz then uses [Express request parameters](https://expressjs.com/en/api.html#req.params) to pick out the requested language and again, select the relative entry from the assets endpoint.

## Generating a dynamic service worker

We have collected the assets we need to generate the service worker we could look at the three different areas of performance we wanted to look at.

**Caching** `**css**` **and** `**js**`

Having attended different Google events and hackathons we decided early on we were going to use [Workbox](https://developers.google.com/web/tools/workbox) to build our service worker. There is already an `api` that will allow us to cache our asset out of the box.

> *Workbox takes a lot of the heavy lifting out of [pre-caching](https://developers.google.com/web/tools/workbox/modules/workbox-precaching) by simplifying the API and ensuring assets are downloaded efficiently.*

Implementing it is extremely simple:
```
workbox.precaching.precacheAndRoute([“/assets/mrp-en-da9f468f.js”]);
```
We generate the array of assets from an inbound request into Woz. This fetches all our environments’ service asset manifests, identified by the store and language of the request, and flatten them into a single array.

`precacheAndRoute` will take care of invalidating and updating the cache based on the assets’ cache headers. As we hash our file names, we can be very aggressive with our caching policy:
```
**cache-control:** max-age=15768000, immutable
```
Another thing to consider is service worker will cache both the source and bytecode of your JavaScript. While this means there is zero parse and compile cost for them on repeat visits, it does increase the memory usage. If your user has an older device with less available I/O, this could prove to be slower than `the Isolate cache`.

_For more reading around how JavaScript is cached within V8 see:_ [_Code caching for JavaScript developers_](https://v8.dev/blog/code-caching-for-devs)_._

**Improve third party script caching**

Third-party scripts can be a performance killer. We wanted the ability to override their cache policy within a service worker.

> *A service worker can intercept network requests for a page. It may respond to the browser with cached content, content from the network or content generated in the service worker.*
> 
> *[workbox-routing](https://developers.google.com/web/tools/workbox/modules/workbox-routing) is a module which makes it easy to “route” these requests to different functions that provide responses.*

An additional complexity is often third-party scripts don’t have [cross origin headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) so they are treated like an [opaque response](https://blog.fullstacktraining.com/what-is-an-opaque-response). This means they can’t be cached like a normal asset, again Workbox comes to the rescue and has a way of dealing with [third party scripts](https://developers.google.com/web/tools/workbox/guides/handle-third-party-requests) without `cors`.

We extended their example to also include overriding the `ttl`:
```
const script = {  
  url: [https://third-party.com/script.js],  
  maxAgeSeconds:86400 # cache for 24 hours  
};

workbox.routing.registerRoute(  
  script.url,    
  new workbox.strategies.CacheFirst({  
    'third-party-scripts', # cache name  
    plugins: [   
      new expiration.Plugin({  
        maxEntries: 1, # you only need one entry per script  
        maxAgeSeconds: script.maxAgeSeconds  
      }),  
      new workbox.cacheableResponse.Plugin({  
        statuses: [0, 200] # cache only opaque & successful requests  
      })  
    ]  
  }),  
);
```
Now if a developer wants to cache a third party script, all the need to do is add some additional configuration to Woz:
```
thirdPartyScriptCaching:  
  scripts:  
    sample-script:  
      url: [https://third-party.com/script.js]  
      maxAgeSeconds: 86400 # 24 hours
```
**Using** [**app shell**](https://developers.google.com/web/fundamentals/architecture/app-shell) **architecture to cache html**

> *The app “shell” is the minimal HTML, CSS and JavaScript required to power the user interface and when cached offline can ensure **instant, reliably good performance** to users on repeat visits. This means the application shell is not loaded from the network every time the user visits. Only the necessary content is needed from the network.*

Setting up app shell is very similar to caching third party scripts where content is cached based on `registerRoute`. Again, certain areas of the site have their own strategy for assets, and header and footer `html` so we wanted to offer the development teams flexibility.

If a developer wants to register an app shell for a certain domain, they can do the following in configuration:
```
sw:  
 services:  
   sample-app:  
     paths:  
       sample-route: sample-route\/*  
     shells:  
       sample-route: sample-route
```
-   `paths` represent the inbound request `url` we allow the developers to input a regular expression. We use this to register a route for a specific app shell
-   `shells` is the request made for the required app shell, again we allow developers to input a regular expression

This example means when an inbound request comes to `https://your-domain.com/sample-route/additional-path` will will no longer rely on the initial `http` request for the `html` but serve the shell from`https://your-domain.com/sample-route`.

To give an example the above configuration would generate the following code:
```
const appshell = {  
  paths: 'sample-route\/?$',    
  shell: 'sample-route'  
};

const staleWhileRevalidate = new strategies.StaleWhileRevalidate({ cacheName: 'app-shell-cache');

const shellRegEx = `/${language}-${country}/${shell}`;  
const pathRegEx = new RegExp(`/${language}-${country}/${path}`);

routing.registerRoute(  
  pathRegEx,  
  () => staleWhileRevalidate.handle({ request: shellRegEx })  
);
```
[**Navigation preload**](https://developers.google.com/web/updates/2017/02/navigation-preload)

We wanted to make sure we didn’t impact our stores’ performance by deploying service worker so we introduced preload navigation which Google Web Standard developer [Jake Archibald](https://developers.google.com/web/resources/contributors/jakearchibald) explains in the article “[Speed up Service Worker with Navigation Preloads](https://developers.google.com/web/updates/2017/02/navigation-preload)”

Once again Workbox comes to the rescue with an inbuilt `api` [Workbox preload navigation](https://developers.google.com/web/tools/workbox/modules/workbox-navigation-preload). As our service is dynamic we need to take advantage of the whitelist/ blacklist parameters so we don’t intercept requests we don’t need to.

However, we see an error in the developer console, it doesn’t affect performance but can be quite annoying while debugging. If you are interested you can [track the issue here](https://github.com/GoogleChrome/workbox/issues/2178).

_This_ `_api_` _has not shipped for all browsers while writing this article._

# Conclusion

Implementing a service worker is relatively straight forward. Our main concern is how powerful it is — we were worried that if we made a bad release, it would be in a cache that we could no longer correct.

We introduced a good level of protection through by hashing our assets and most importantly through the introduction of a kill switch within Woz that would generate a new service worker killing the faulty service worker.

There were some changes in Chrome 68 for enabling [fresher service workers](https://developers.google.com/web/updates/2019/09/fresher-sw):

> *Starting in Chrome 68, HTTP requests that check for updates to the service worker script will no longer be fulfilled by the [HTTP cache](https://developers.google.com/web/fundamentals/performance/optimizing-content-efficiency/http-caching) by default. This works around a [common developer pain point](https://developers.google.com/web/tools/workbox/guides/service-worker-checklist#cache-control_of_your_service_worker_file), in which setting an inadvertent `Cache-Control` header on your service worker script could lead to delayed updates.*

That made us more confident about reducing the caching of potential regressions, but we also realised that alternatively we could also look into using [messages from the client side app](https://googlechrome.github.io/samples/service-worker/post-message/) to a service worker to force an update.

We wanted to make sure our service was completely dynamic, easy-to-use and transparent for domain-specific developers. In the end we spent more time developing a test suite for Woz than we did creating it (we will cover this in the next article of this series).

While we are happy with what we developed, we did encounter some issues that we would like to see addressed from the developers working on the service worker standards. Some of these issues may be related to the structure of our development teams but they may also be issues for large segregated teams.

Regardless of scoping, service workers are ultimately one `js` file for the entire site. Even if you take our approach of dynamically generating a service worker based on the inbound request, you will find yourself repeating a lot of code. If you want to have different rules per route you either need to run different service workers on different scopes or dynamically generate all the rules into one file with all your global `PWA` rules replicated. None of this makes for easy automation testing or clean code. While you can use `scriptImport` to give a level of abstraction, this means additional `http` requests, and they still need to come together in a single file.

We would like to see service worker get a concept of… not exactly inheritance, but a level of hierarchy. We would like the ability to extend service worker based on the request. So, you might have a route level service worker that contains your `PWA` specific code that sits on the root of your site. You could then extend this service worker from a deeper URL request such as `https://www.mrporter.com/en-us/checkout`.

In the end however, we are really happy with our solution and we are currently rolling it out to different regions while we collect performance and customer behaviour metrics.

If you want to get an early preview you can see it here: [https://www.mrporter.com/en-us/](https://www.mrporter.com/en-us/)

In writing Woz, we did a lot of research into different areas of the web stack, these resources really helped us and they might help you too.

[](https://web.dev/google-search-sw/)

## Bringing service workers to Google Search

### Search for just about any topic on Google, and you're presented with a page of meaningful, relevant results. What you…

web.dev

[](https://developers.google.com/web/fundamentals/primers/service-workers/high-performance-loading)

## High-performance service worker loading | Web Fundamentals

### Adding a service worker to your web app can offer significant performance benefits, going beyond what's possible even…

developers.google.com

[](https://v8.dev/blog/code-caching-for-devs)

## Code caching for JavaScript developers

### Code caching (also known as bytecode caching) is an important optimization in browsers. It reduces the start-up time of…

v8.dev

[](https://v8.dev/blog/cost-of-javascript-2019)

## The cost of JavaScript in 2019

### Note: If you prefer watching a presentation over reading articles, then enjoy the video below! If not, skip the video…

v8.dev

[](https://codelabs.developers.google.com/codelabs/debugging-service-workers/#0)

## Debugging Service Workers

### Service Workers give developers the amazing ability to handle spotty networks and create truly offline-first web apps…

codelabs.developers.google.com
