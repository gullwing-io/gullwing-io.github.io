


# Microservices: Solving a problem like routing — part 2

_This is the second part in a series around how we designed, build and introduced a new routing tier at_ [_YNAP_](http://www.ynap.com/)_,_ [_Part 1 is available here_](https://medium.com/@robinglen/microservices-solving-a-problem-like-routing-part-1-8e48d789e57)_._

## Doing our homework

We knew what we wanted to build now we needed to make sure, whatever we did, this new application could handle our peak traffic on sale.

First we looked into a couple of available options:

-   GOV.UK Router: [https://github.com/alphagov/router](https://github.com/alphagov/router)
-   Skipper: [https://github.com/zalando/skipper](https://github.com/zalando/skipper)

Although all looked great and worth a look if you have a similar issue, they didn’t quite match our requirements. There was a lot of features we didn’t need or didn’t need yet, we wanted to keep the service small and very light touch, so we started investigating creating our own.

It’s important before just sitting down and writing code, you do your homework and understand the problem you’re trying to solve. The first step was to understand what kind traffic we would need to be able to handle. As described in [part 1](https://medium.com/@robinglen/microservices-solving-a-problem-like-routing-part-1-8e48d789e57), our systems were now distributed, sub teams only cared about their own applications metrics. There was now only one place we could easily collect overall hits to origin, CDN.

There were two key patterns we wanted to understand:

### Normal traffic

![](https://miro.medium.com/max/1090/1*CCr9iFEQCjEekfc-Cp7RXQ.png)
<sub>Daily traffic over a week</sub>

![](https://miro.medium.com/max/1090/1*KK5VMnNnbTwDfvV8DN1URA.png)
<sub>Traffic over a single day</sub>

As a global business we always have traffic but there are trends we can identify. Customers generally have three distinct shopping periods:

1.  Over breakfast and the commute
2.  Lunch time at work
3.  At home in the evening

These visible patterns make for a candidate for autoscaling, adding and removing servers as the are needed.

### Sale traffic

![](https://miro.medium.com/max/1164/1*KXizIv7TNKpV1gPiqebaMQ.png)

Here we can see the impact of first markdowns on a sale. During the day, traffic steadily increases but when social media, email and notifications go out and this will peak normally within that hour. Traffic will be noticeably higher for the whole period however it’s the peak and that first 24 hours we need to focus on.

We now understood the levels of traffic and the ratio of grow we needed to be able to handle.

### Making a technology choice

Once we had these metrics, we wanted to make sure we picked a technology that could handle the amount of requests needed. We looked a number of options but settled on:

-   [NGINX+ & JS Module](https://www.nginx.com/blog/introduction-nginscript/)
-   [Go](https://golang.org/)
-   [Node JS](https://nodejs.org/en/)

At this point there was conversations that this system may ultimately end up back with the Ops team. This was something that went against the original design but because of this, we felt we had to investigate a technology they had more experience with. In the end although NGINX was a great option for proxying requests we decided for the programmatical requirements it didn’t suit our needs and ruled it out.

So we were left with two programming languages. We wanted to test their raw throughput, to do this we would create a simple “Hello World” web application and see how they would compare against our hits to origin metrics.

### “Hello World”

The plan was build a simple web application that just responded with a `200` and a body of “Hello world”. Then load test the service and record the latency and requests per second.

**Load test configuration**

At this point in time we only needed a simple load test. Both the application and the load test would be running on the same machine, for reference that is:
```
iMac (Retina 5K, 27-inch, Late 2014)  
Processor: 4 GHz Intel Core i7  
Memory: 16 GB 1600 MHz DDR3
```
Using [wrk](https://github.com/wg/wrk) to run a simple load test on each:
```
$ wrk -c 10 -d 10  http://localhost:8123
```
We would run this 5 times and collect an average, this will be shown after each code snippet.

**Go**
```
package main

import (
 "fmt"
 "log"
 "net/http"
)

func main() {
http.HandleFunc("/", func(res http.ResponseWriter, req *http.Request) {
  fmt.Fprint(res, "Hello World")
 })
  
log.Println("Go Hello World listening on port 8123")
 http.ListenAndServe(":8123", nil)
}
```
-   **Latency:** 1.64ms
-   **Req/Sec:** 35,959

We were more than happy with these results so didn’t attempt to tune any further.

**Node — native HTTP**
```
const http = require('http');
const port = 8123;

const server = http.createServer((req, res) => {
    res.write('Hello World');
    res.end();
});

server.listen(port, () => {
    console.log(`HTTP "Hello World" listening on port ${port}`);
});
```

-   **Latency:** 1.35ms
-   **Req/Sec:** 8087

This was considerably lower requests per second than we got from Go, so we introduced a web framework. We have previously used [Express](https://expressjs.com/) and knew its capabilities but knew we needed something more performant so opted for [Fastify](https://www.fastify.io/).

**Node — Fastify**
```
const fastify = require('fastify')();
const port = 8123;

fastify.get('*', (req, res) => {
  res.send('Hello World');
});

fastify.listen(port, () => {
  console.log(`Fastify "Hello World" listening on port ${port}`);
});
```
-   **Latency:** 2.40ms
-   **Req/Sec:** 24,094

Although this was a littler slower on latency we were now closer to the Go requests per second. The last improvement we made to the Node “Hello world” was to take advantage of the multiple cores by using simple clustering:
```
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;
const fastify = require('fastify')();
const port = 8123;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', worker => {
    console.log(`Worker ${worker.process.pid} died`);
  });
} else {
  fastify.get('*', (req, res) => {
    res.send('Hello World');
  });
  fastify.listen(port, () => {
    console.log(`Fastify "Hello World" listening on port ${port}, PID: ${process.pid}`);
  });
}
```
-   **Latency:** 1.46ms
-   **Req/Sec:** 44,882

To help you consume that a little easier.

![](https://miro.medium.com/max/1400/0*UNdmhPRhWorrfYa3)
<sub>Comparing Go vs Node “Hello World” Req/Sec

Now we knew both languages were viable options the next step was to create POCs in both.

## Building a couple of POCs

We now know the two languages we were going to use to solve the problem, the next steps was taking a vertical slice of the application, building it and testing it.

We opted for a Go proof of concept and another with Node + Fastify without clustering.

### Performance testing localisation

As described in the architecture one of the requirements for the application when it receives a request like:
```
$ curl -I http:localhost:8080/my-web-page
```
It would return:
```
HTTP/1.1 302 Moved Permanently  
Location: http:localhost:8080/en-gb/my-web-page
```
Notice how it’s added the localisation pattern `en-gb` in the URL. The application follows some specific business logic to decide the correct locale:

1.  If the request includes country and language iso cookies, use those.
2.  If cookies are not present, look for geo locale header (set by our CDN), use that and browser language.
3.  If either are found use default.

Once we build this feature, we load tested it on both POCs.

![](https://miro.medium.com/max/1400/0*8-iqEQTZ697mXLXm)
<sub>Go vs Node + Fastify, localising requests.</sub>

Go consistently handled more requests and Node got slightly less performant as we added more concurrent users.

### Performance testing proxying requests

The key feature of the application is to be able to proxy requests to the correct service based on a request, so we expect this to be the most common code path.

![](https://miro.medium.com/max/1400/0*f_pXdvDNgofE4EXl)
<sub>Go vs Node + Fastify, proxying requests.</sub>

Although performance is similar to start with Go eclipses Node as we add more concurrent users. This however is to be expected, Go is taking advantage of multiple cores however in this instance Node is only using one.

### Selecting a technology

Once we had run multiple load tests, tweaked our code, we had a clear winner when it came down to performance, Go.

We decided to go with Node JS. Why when we saw it didn’t perform as well in our load tests?

1.  We were not massively concerned with the performance difference. We were only using one core on the Node POC, we could make up some of the difference with clustering if we wanted. We can also easily horizontally scale the application when required.
2.  Just because the technology is the better performing doesn’t automatically mean its the correct choice. We have limited production Go experience within our team however we been running Node in production for five years. This gives us a wealth of in house modules already available to use, years of experience understanding anomalous and how to handle issues if things do go wrong.

Our main concern was introducing a single point of failure and a performance bottleneck. While there is now an application sitting infront of our Microservices after testing our POCs we were happy it could handle the load. We can also run multiple instances to protect us incase one was to go down, and also include aggressive autoscalling rules to add more if we need it.

With the design complete, a simple POCs tested, a technology selected and eliminated our fears, we could now move on to building the actual solution.

In the [final part of the series](https://medium.com/ynap-tech/microservices-solving-a-problem-like-routing-2020-update-e623adcc3fc1) we will be starting to build the application, looking into some code, deploying it into the wild and monitoring its performance.
