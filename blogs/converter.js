const fs = require('fs');
const marked = require('marked');

var listOfDirectoryFiles = fs.readdirSync('markdown-blogs');

console.log(listOfDirectoryFiles);

var listOfMarkdownFiles = [];
//find the markdown files and put them in their own array
for(let i = 0; i < listOfDirectoryFiles.length; i++){
   const currentFileName = listOfDirectoryFiles[i];
    const isMarkdown = currentFileName.indexOf(".md");
    if(isMarkdown != -1){

        listOfMarkdownFiles.push(currentFileName);
    }
}

console.log(listOfMarkdownFiles);

for(let i =0; i< listOfMarkdownFiles.length; i++){
    const currentFileName = listOfMarkdownFiles[i];
    //store the whole markdown file contents in currentFileBuffer
   const currentFileBuffer = fs.readFileSync('markdown-blogs/' + currentFileName);
    //Turn content to string
    const fileContent = currentFileBuffer.toString();
   //pass the file through marked
   var newHTMLFile = marked.marked(fileContent);
   //get the new file name
   const newFileName = currentFileName.slice(0,-2) + 'html';
   //write the html file with its new name
   fs.writeFileSync('html-blogs/'+newFileName, newHTMLFile);
}
