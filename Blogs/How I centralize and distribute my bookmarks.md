


# How I centralize and distribute my bookmarks

At a large company there are thousands of different internal URLs, from multiple development environments, workflow tools and HR systems. New tools are often introduced, old ones decommissioned or hostnames changed, I often joked that if I cleared my internet history I wouldn’t be able to do my job.

The only real authority of truth was crowdsourced by asking in Slack what the URL was for a certain service. If you were lucky someone might have already set up a bot to respond, if you were unlucky it might start a flamewar about how bad the latest HR platform was. The idea of crowdsourcing URLs and their authority of truth would run through mind for a while.

At the start of this year I moved to a start up and while there are a lot less URLs they were still distributed in different tools and not always up-to date. I again started thinking about a way to centralise bookmarks while still allowing you to use your existing tools. Having spent the last few years of my career working in infrastructure there was only one solution in my mind… `YAML`!
```
label: Bookworms  
description: These are sample bookmarks  
folders:  
  - label: folder 1  
    description: This is to describe the folder structure  
    folders:  
      - label: sub folder 1  
        description: This is to describe the sub folder structure  
        bookmarks:  
          - label: sample url 1  
            description: this is used to describe the bookmark  
            href: 'https://www.mywebsite.com'
  - label: folder 2  
    folders:  
      - label: sub folder 2  
        bookmarks:  
          - label: sample url 2  
            description: this is used to describe the bookmark  
            href: 'https://www.mywebsite.com'
          - label: sample url 3  
            description: this is used to describe the bookmark  
            href: 'https://www.mywebsite.com'  
      - label: sub folder 3  
        bookmarks:  
          - label: sample url 4  
            description: this is used to describe the bookmark  
            href: 'https://www.mywebsite.com'
```
Creating a standardised structure for URLs based on bookmarks and folders would allow people to easily contribute and add the ability to transform this data into different formats.

## Markdown

Something very common in the industry is people maintaining a list of useful links and storing them in Github as a `README.md` . You can see a great example here: [https://github.com/binhnguyennus/awesome-scalability](https://github.com/binhnguyennus/awesome-scalability)

If you have your bookmarks stored as `YAML` this is a pretty straight forward transformation. With a few lines in `NodeJS` I was able to convert the bookmarks `YAML` into a `README.md`.

![](https://miro.medium.com/max/1400/1*2VE46SJAwK2j50DpQkzejw.png)

## Chrome

While converting into markdown is a nice way to self document a repository I wanted these bookmarks to be more practical and be available when and where I need them.

Looking into the Chrome [Bookmark manager](https://support.google.com/chrome/answer/188842?hl=en-GB&co=GENIE.Platform%3DDesktop) I saw exporting your bookmarks just saved a `HTML` file. All I needed to do was generate this `HTML` file from the `YAML`.

![](https://miro.medium.com/max/1400/1*GNPpIfyHSEhVvbxxsXZPpA.png)

Again I was able to do this with `NodeJS`, generating and saving a file I could import into my browser.

![](https://miro.medium.com/max/1400/1*wtpSHUlWmMPZEytmqKlgVg.png)

My bookmarks were now available within my Chrome toolbar. To my surprise this `HTML` is standardised in most common browsers, from testing file works for:

-   [Chrome](https://support.google.com/chrome/answer/96816?hl=en-GB)
-   [Safari](https://support.apple.com/en-gb/guide/safari/ibrw1015/mac)
-   [Edge](https://support.microsoft.com/en-us/windows/move-internet-explorer-favorites-to-a-new-pc-a03f02c7-e0b9-5d8b-1857-51dd70954e47)
-   [Firefox](https://support.mozilla.org/en-US/kb/import-bookmarks-html-file)
-   [Brave](https://support.brave.com/hc/en-us/articles/360019782291-How-do-I-import-or-export-browsing-data-)

You can find instructions of how to import bookmarks on the links above, other browsers might also work but they have not yet been tested.

# Bookworms

![](https://miro.medium.com/max/1112/1*SDB1Z9jgUAm2Vxc6GpAilg.png)

[Bookworms](https://github.com/thearegee/bookworms) is the tool I wrote that allows, people, teams or a company to store, share, update and centralize their important links while giving multiple useful outputs.

Currently you need to have `Node` and `npm` [installed on your machine](https://nodejs.org/en/download/package-manager/) once this is done you can use it with the following command:
```
npx bookworms get ./my-bookmarks.yaml
```
This will generate the files `README.md` and a `browsers.html` in the same directory it’s run. You can also fetch bookmarks from a remote location and output the exports into a different directory:
```
npx bookworms get https://raw.githubusercontent.com/thearegee/bookworms/main/demo/config/bookmarks.yaml -d="./output"
```
For storing your bookmarks I recommend having a repository that contains the `YAML`, `README.md` and `browsers.html` files together, here people can view, import or contribute to your bookmarks. You can see an example here: [https://github.com/thearegee/bookworms/tree/main/demo](https://github.com/thearegee/bookworms/tree/main/demo)

Currently you need to run the `npx` command after each update to the `YAML` file, check in the the changes and then reimport `browsers.html`, however this is something I’m working on automating.

You can also import Bookworms like a normal `npm` module and then use it programmatically. I recently did this at a company hackathon where I built a Slackbot that could respond with company bookmarks.

This started by building a simple web server using [Fastify](https://www.fastify.io).
```
import Fastify from "fastify";
import fastifyForm from "fastify-formbody";
import { init } from "./bookworms.js";
import { sendBookMarks, sendBookmarkCommands} from "./slack.js";

const fastify = Fastify();
// fastifyForm is needed to get the body from a POST request
fastify.register(fastifyForm);

// creating a hook for Slack slash commands
fastify.post("/webhooks/slack/bookmarks", (request, reply) => {
  const { body } = request;
  // handle requesting requests when user doesn't specify a folder
  if (body?.text === "" || body?.text.toLowerCase() === "all") {
    reply.send(sendBookmarkCommands());
  } else {
    reply.send(sendBookMarks(body.text));
  }
});

fastify.listen(3000, async (err) => {
  // loading from file system the bookmarks
  await init();
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
```
This server is exposing an endpoint that can be used by [Slack’s slash commands](https://api.slack.com/interactivity/slash-commands). When this endpoint is called we inspect the body looking to see if they added additional information after the the slash. This allows us to give different responses based on what the user requests but before that we need to load the bookmarks into memory.
```
// importing the required exposed methods from bookworms
import { loadBookmarks, generateBookmarks } from "bookworms";

// don't really like this global but its fine for this hack
let bookmarks = "";

// load the config into memory
const init = async () => {
  // for production add some error handling
  const { body } = await loadBookmarks.fetchBookmarkConfig("./bookmarks.yaml");
  bookmarks = body;
};

// generating the markdown only for the top level folder requested in the slash command
const generateBookmarkMarkdown = (folder) => {
  // find the requested folder in the global bookmarks loaded
  const requestedFolder = findBookMarkFolder(folder, bookmarks.folders);
  if (requestedFolder) {
    // creating the structure generateImportBookmarkMarkup expects
    const selectedBookmarks = {
      folders: [requestedFolder],
    };
    // taking the readme as this is markdown
    const [browser, readme] =
      generateBookmarks.generateImportBookmarkMarkup(selectedBookmarks);
    // return the body which is the markdown
    return readme.body;
  } else {
    // error message if the folder is not found
    return `Sorry ${folder} could not be found, use \`/bookmarks all\` for a list of available bookmarks`;
  }
};

// used for showing a dynamic list of available top level folders
const listOfBookmarksMarkDown = () => {
  const commands = bookmarks.folders.map((folder) => {
    return `\`/bookmarks ${folder.label.toLowerCase()}\``;
  });
  // adding in new line for formatting in Slack response
  const commandsMarkdown = `
    ${commands.join("\r\n")}
    `;
  return `Bookmarks are seperated into different domains, to get the specific bookmarks you can enter the following commands
    ${commandsMarkdown}
    `;
};

// returning the markdown of the requested top level folder
const findBookMarkFolder = (name, folders) => {
  return folders.find((folder) => {
    if (folder.label.toLowerCase() === name) {
      return folder;
    }
  });
};

const getBookmarks = (folder) => generateBookmarkMarkdown(folder);

export { init, getBookmarks, listOfBookmarksMarkDown };
```

This code is loading the `YAML` into memory, converting it into markdown then based on the slash comment coming from the webhook returning the bookmarks of the folder requested.

The final part is formatting a response for Slack.
```
import slackifyMarkdown from "slackify-markdown";

const headerForSlackMessage = () => {
  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Bookmarks",
      },
    },
    {
      type: "divider",
    },
  ];
};

const sendBookmarkCommands = () => {
  return {
    ...headerForSlackMessage(),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: slackifyMarkdown(listOfBookmarksMarkDown())
      },
    }
  ]};
};

const sendBookMarks = (folder) => {
  return {
    blocks: [
    ...headerForSlackMessage(),
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: slackifyMarkdown(getBookmarks(folder))
      },
    }]
  };
};
```

These two simple methods are used to respond to Slack slash commands returning a stylised response. There are some slight nuances between standard markdown and Slacks version, I used `slackifyMarkdown` to take care of that.

Below you can see some examples that are running on our [AGORA](https://www.agoraworld.co/) Slack channel. When a user calls `/bookmarks` or `/bookmarks all` they are returned all the different commands they can use based on the top level folders in the bookmarks `YMAL` .

![](https://miro.medium.com/max/1400/1*o61HxKrVj4CxS3lkdQiPtA.png)

If the user enters a folder name not recognised they get returned a helpful error:

![](https://miro.medium.com/max/1400/1*q2HdkdAzVdrHm6XH42bF-A.png)

On a successful request they will get all the bookmarks returned in the same structure as the `README.md` but this time only scooped to the requested folder.

![](https://miro.medium.com/max/1342/1*hL6AJOrL8rr3rASeGkhiKQ.png)

**UPDATE:** _I have moved the code that powers this Slack bot into module for_ [_Express_](https://expressjs.com/) _and_ [_Fastify_](https://www.fastify.io/) _so you can add_ [_Bookworms for Slack_](https://github.com/thearegee/bookworms-slack-webhook) _into your workflow._

# Try it out!

The CLI is available on [Github](https://github.com/thearegee/bookworms) to export your existing bookmarks, generate bookmark `YAML`and import them into your browser or project. If you are interested in contributing or maybe you have another idea for how you can use [Bookworms](https://github.com/thearegee/bookworms), you can read more here: [https://github.com/thearegee/bookworms](https://github.com/thearegee/bookworms)

Thank you and happy bookmarking!
