const {readdirSync, readFileSync, writeFileSync} = require('fs');

const showdown = require('showdown');

const convertToHTML = new showdown.Converter();

const listOfMarkdownFiles = readdirSync('markdown');

console.log(listOfMarkdownFiles);

listOfMarkdownFiles.forEach(file=>{
    const fileContent = readFileSync(`markdown/${file}`, 'utf8');
   ///Find and remove the pesky invisible character that messes the first title formatting
    const formattedFile = (fileContent.replace('﻿#', '#'));
   //pass the file through the converter
   const newHTMLFile = convertToHTML.makeHtml(formattedFile);
   //write the html file with its new name
   writeFileSync(file.replace('.md', '.html'), newHTMLFile);
});