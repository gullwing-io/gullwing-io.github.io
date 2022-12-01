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
    const $ = cheerio.load(newHTMLFile);
    //use cheerio to find the title and image
    const cheerioTitle = $('h1').first().text();
    const cheerioImage = $('img').first().attr('src');
    console.log(cheerioImage);
    //now we have to retrieve the text without the html tags for our description

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
    const handlebarsInput = {title: cheerioTitle, mainContent: newHTMLFile, description: rawDescription, image: cheerioImage};


    //apply template
    const templatedFile = template(handlebarsInput);
    //apply the meta tags with unique titles, images and descriptions
    //write the html file with its new name
    writeFileSync(file.replace('.md', '.html'), templatedFile);
});
const list = readFileSync('list.html', 'utf8');
const listHandlebarsInput = {title: 'Article List', mainContent:list};
const templatedList = template(listHandlebarsInput);
writeFileSync('templated-list.html', templatedList);