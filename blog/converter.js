const {readdirSync, readFileSync, writeFileSync} = require('fs');
const showdown = require('showdown');
const convertToHTML = new showdown.Converter();
const Handlebars = require('handlebars');
const cheerio = require('cheerio');
//get the list of markdown blogs
const listOfMarkdownFiles = readdirSync('markdown');

//console.log(listOfMarkdownFiles);

//generate the template to apply to the files
const template = Handlebars.compile(readFileSync('template.hbs', 'utf8'));

listOfMarkdownFiles.forEach(file=>{
    const fileContent = readFileSync(`markdown/${file}`, 'utf8');
    //Find and remove the pesky invisible character that messes the first title formatting
    const readableFile = (fileContent.replace('﻿#', '#'));
    //pass the file through the converter
    const newHTMLFile = convertToHTML.makeHtml(readableFile);
    //separate title from body
    const jsHeaderStart = '<h1';
    const jsHeaderEnd = '</h1';
    const titleStart = newHTMLFile.search(jsHeaderStart);
    const titleEnd = newHTMLFile.search(jsHeaderEnd);
    var titleFull = newHTMLFile.substring(titleStart, titleEnd);
    //remove the header formatting
    titleFull = titleFull.replace(jsHeaderStart, '');
    titleFull = titleFull.replace(jsHeaderEnd, '');
    //while this has removed some of the issue there's an id tag attached to the title
    const titleIdTag = titleFull.search('">');
    titleFull = titleFull.substring(titleIdTag);
    titleFull = titleFull.replace('">', '');
    console.log(titleFull);
    //find the first image in the file
    const firstImageLocationStart = newHTMLFile.indexOf('<img src=');
    //since '<img src="' is ten characters the url of our first image is the previous index +10
    var firstImage = newHTMLFile.substring(firstImageLocationStart+10);
    //now having cut everything up until this point the first index of " will be the end of the image url
    const firstImageLocationEnd = firstImage.indexOf('"');
    firstImage = firstImage.substring(0, firstImageLocationEnd);
    //now we have to retrieve the text without the html tags for our description
    const $ = cheerio.load(newHTMLFile);
    //take the raw text in the paragraphs
    var rawDescription = $('p').text();
    //take the first 100 words
    rawDescription = rawDescription.split(' ').slice(0, 100).join(' ');
    //since we have taken from multiple paragraphs there's instances of fullstops without a space after, let's fix that
    rawDescription = rawDescription.replace('.', '. ');
    rawDescription = rawDescription.replace('.  ', '. ');
    rawDescription = rawDescription.replace('!', '! ');
    rawDescription = rawDescription.replace('!  ', '! ');
    rawDescription = rawDescription.replace('?', '? ');
    rawDescription = rawDescription.replace('?  ', '? ');
    //add an ellipses at the end
    rawDescription = rawDescription.concat('...');
    //pass all the relevant parameters into the template
    const handlebarsInput = {title: titleFull, mainContent: newHTMLFile, description: rawDescription, image: firstImage};


    //apply template
    const templatedFile = template(handlebarsInput);
    //apply the meta tags with unique titles, images and descriptions
    //write the html file with its new name
    writeFileSync(file.replace('.md', '.html'), templatedFile);
});
const list = readFileSync('list.html', 'utf8');
const listHandlebarsInput = {title: 'Article List', mainContent:list};
const templatedList = template(listHandlebarsInput);
writeFileSync('templatedlist.html', templatedList);