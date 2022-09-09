# Microservices: Solving a problem like routing - part 1

If you’ve never heard of [YNAP](http://www.ynap.com/), we are an online retailer averaging a billion page-views per month. I work within the In-Season team, we are responsible for both [NET-A-PORTER](https://www.net-a-porter.com) and [Mr Porter](https://www.mrporter.com). Our frontend teams love Microservices, however for all their advantages they have also bought us new challenges.

The one I want to talk about today, is how we route a request to the correct frontend application. Before talking about where we are, I think it’s important to explain how our architecture has evolved.

# A little bit of history…

When I joined [NET-A-PORTER](https://www.net-a-porter.com), our brother brand [Mr Porter](https://www.mrporter.com) didn’t exist and our website architecture was fairly straightforward.

![](https://miro.medium.com/max/1400/1*dipIIwQ6UcUJdc2BvKHSoA.png)<sub>
A request from a customer on our original architecture.
</sub>
When a request came in it would hit our CDN, if the content was stale it would go back to origin, a monolithic Java web application. This simplified design would remain in place from 2000 to 2010. It worked well, making us a multimillion-pound company, but as we grew it started to hold us back.

Our traffic pattern is generally consistent, except for the two occasions a year we have a sale. On the first day of markdowns our traffic can increase by more than ten times. Twice a year the sale would go live and twice a year, the site would go down.

At the time we were running the applications in our own data centre. We could have solved the issues sale day traffic caused by increasing our infrastructure but apart from the initial 24 hours, this extra hardware would be redundant.

We needed to think about things differently.

![](https://miro.medium.com/max/1400/1*GxKqoHiQ8OJkgIWdyvrAQQ.png)<sub>
A request that contained “sale” in the URL would be sent to a different origin on AWS.
</sub>
A project run by the NAP tech team designed a new application just to handle sale traffic. It was written in Node JS, ran in AWS and would scale horizontally when more traffic came onto the site. When traffic dropped off, it would scale down so we were no longer paying for unused servers.

An easy way of routing traffic was to add rewrite rules to the new application on the CDN. When a request contained the word `sale`, traffic would go to a different origin. We used this approach because it lowered the number of network hops required but also, honestly, it was quick and easy to get out the door.

The project was a great success and sale stayed up! The development team saw the advantages of Microservices, and over the next four years our architecture would evolve to look more like this:

![](https://miro.medium.com/max/1400/1*z0tIps31wP45bHCWBkm1gw.png)<sub>
The evolution of our Microservice architecture.
</sub>
As more and more teams saw the advantages of Microservices, they started to break out their team domain applications from the monolith and deploying them in isolation into AWS. With improved testing, increased ownership and smaller, cleaner codebases, teams were iterating faster, experimenting more and delivering features quicker.

With all the success and growth however, some foundations were built on short term solutions. The rules set at CDN were becoming a lot more complicated. There was no automation testing for a new rewrite, so we would have to run regression tests on the live site after a change to make sure everything still worked.

To top it off, there isn’t a CDN in front of development environments, so we ended up with something else that was pretty ugly:

![](https://miro.medium.com/max/1400/1*TBcb4D7o15aPSGurFt5Bkw.png)<sub>
Microservice architecture within our dev stack.
</sub>
We would use the Apache running our legacy web application to hack in rewrites for our new Microservices that were running in AWS.

Although we could create regression tests for development, Apache’s `regex` parser was actually different to our CDN’s so we could not deploy the same rule, this give us very little confidence in our testing. Not only that but ourso-called legacy system, that we were trying to deprecate, was again handling all requests and orchestrating our entire development workflow.

As the architecture got more and more complicated it made debugging live issues a nightmare. Projects were separated and deployed by different sub teams independent of each other, while the CDN rewrites were deployed by a centralised Ops team. Soon only a handful of senior developers knew the entire estate of our website. It became difficult to know at a glance what pages were being served by what application and what application was talking to what service.

This eventually concluded with what was known as, “the lady in red”:

![](https://miro.medium.com/max/1400/1*vN9vUC5xgQnIPIGL2wOhog.png)<sub>
“The lady in red” confusingly, actually wore white.
</sub>
Unlike what the article suggested, we could _now_ handle the incredible demand. What proved the most upsetting was the technical debt, we knew we had to address, finally caught up with us. Wanting to ship features had exposed our foundations and the sheer complexity of the architecture lead to the longest outage for [NET-A-PORTER](https://www.net-a-porter.com), [MR PORTER](https://www.mrporter.com) and [THE OUTNET](https://www.theoutnet.com) all at the same time.

To make matters worse, when customers called customer care about the site being down, all they wanted was to buy the products the model was wearing on the error page and we didn’t have them in stock!

We once again needed to think about things differently.

# Designing the routing tier

![](https://miro.medium.com/max/1400/1*29Dxjw3CGAlAzhLy4bBmAg.png)<sub>
Routing our Microservices architecture in 2018.
</sub>
We set about designing a new system hoping to eliminate some of the complexity of our architecture. Routing was to be handled by an application, proxying requests to different Microservices based on the inbound URL. During the design we noticed certain functionalities common to each microservice and decided this could be a good place to centralise them. In the end we decided the routing tier should be responsible for four key things.

1.  **Localisation** — If the URL was not localised, add a brand specific localisation pattern to the URL and `302` the customer to that new URL
2.  **Routing** — based on the inbound URL, proxy the request to the correct Microservice
3.  **Serve errors** — if the proxied request returned either a `4xx` or a `5xx` let the routing tier send the correct error page in the correct language
4.  **Catch all** — If for some reason the inbound URL doesn’t match a pattern for a Microservice, try and return them some relevant content

We were happy with this concept and it solved some pretty big problems:

-   The frontend teams had autonomy to launch new services
-   Automation testing for rewrite rules
-   GitOps approach allowed new rewrite rules to have an audit trail
-   Simpler CDN configuration
-   Easier to recreate development environments
-   A place to easily centralise performance, error and request metrics
-   Remove code repetition from Microservices
-   A much more transparent architecture

But even with all these advantages, we had concerns with the design, it went against one of our clear principles for Microservices, no single point of failure.

In the next part of this series, we will be looking at how we went about making a technology choice to mitigate this concern. From evaluating platforms and languages, building POCs and load testing them to make sure they fitted our requirements.

All of this will be covered in [part 2](https://medium.com/@robinglen/microservices-solving-a-problem-like-routing-part-2-e197cdd1863c).
