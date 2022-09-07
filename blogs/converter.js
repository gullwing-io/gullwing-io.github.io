const {readdirSync, readFileSync, writeFileSync} = require('fs');

const {marked} = require('marked');

const listOfMarkdownFiles = readdirSync('markdown');

console.log(listOfMarkdownFiles);

listOfMarkdownFiles.forEach(file=>{
    const fileContent = readFileSync(`markdown/${file}`, 'utf8');
   //pass the file through marked
   const newHTMLFile = marked(fileContent);
   //write the html file with its new name
   writeFileSync(file.replace('.md', '.html'), newHTMLFile);
});