const {readdirSync, readFileSync, writeFileSync} = require('fs');

var showdown = require('showdown');

var convertToHTML = new showdown.Converter();

const listOfMarkdownFiles = readdirSync('markdown');

console.log(listOfMarkdownFiles);

listOfMarkdownFiles.forEach(file=>{
    const fileContent = readFileSync(`markdown/${file}`, 'utf8');

    const titleFormatting = '\n\n\n';
    const formattedFile = (titleFormatting + fileContent);
   //pass the file through marked
   const newHTMLFile = convertToHTML.makeHtml(formattedFile);
   //write the html file with its new name
   writeFileSync(file.replace('.md', '.html'), newHTMLFile);
});