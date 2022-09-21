const {readdirSync, readFileSync, writeFileSync} = require('fs');
const showdown = require('showdown');
const convertToHTML = new showdown.Converter();
const Handlebars = require("handlebars");

//get the list of markdown blogs
const listOfMarkdownFiles = readdirSync('markdown');

console.log(listOfMarkdownFiles);

//generate the template to apply to the files
const template = Handlebars.compile(readFileSync('template.hbs', 'utf8'));

listOfMarkdownFiles.forEach(file=>{
    const fileContent = readFileSync(`markdown/${file}`, 'utf8');
    //Find and remove the pesky invisible character that messes the first title formatting
    const readableFile = (fileContent.replace('﻿#', '#'));
    //pass the file through the converter
    var newHTMLFile = convertToHTML.makeHtml(readableFile);
    //separate title from body
    const jsHeaderStart = '<h1';
    const jsHeaderEnd = '</h1';
    const titleStart = newHTMLFile.search(jsHeaderStart);
    const titleEnd = newHTMLFile.search(jsHeaderEnd);
    var titleFull = newHTMLFile.substring(titleStart, titleEnd);
    //remove the header formatting
    titleFull = titleFull.replace(jsHeaderStart, '');
    titleFull = titleFull.replace(jsHeaderEnd, '');
    
    const handlebarsInput = {title: titleFull, mainContent: newHTMLFile};


    //apply template
    const templatedFile = template(handlebarsInput);
    //write the html file with its new name
    writeFileSync(file.replace('.md', '.html'), templatedFile);
});