const {readdirSync} = require('fs');
const {readFileSync} = require('fs');
const {writeFileSync} = require('fs');

const {marked} = require('marked');

const listOfMarkdownFiles = readdirSync('markdown');

console.log(listOfMarkdownFiles);

listOfMarkdownFiles.forEach(function(element){
    const fileContent = readFileSync(`markdown/${element}`, 'utf8');
    //Turn content to string
   //pass the file through marked
   var newHTMLFile = marked(fileContent);
   //get the new file name
   const newFileName = element.replace('.md', '.html');
   //write the html file with its new name
   writeFileSync(newFileName, newHTMLFile);
});