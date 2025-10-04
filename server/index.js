const http = require('http')
const express = require('express')
const fs = require('fs/promises')
const path = require('path')
const { Server: SocketServer } = require('socket.io')
const pty = require('node-pty')
const chokidar = require('chokidar')
const cors = require('cors')
const uniqid = require('uniqid')
const puppeteer = require('puppeteer');



const app = express()

app.use(express.json());

const allowedOrigins = ['https://www.automateandlearn.fun', 'https://automateandlearn.fun', 'http://localhost:*'];

app.use(cors({
    origin: allowedOrigins
}))
const server = http.createServer(app)
const io = new SocketServer({
    cors: {
        origin: allowedOrigins
    }
})

const port = 9000 || process.env.PORT

const ptyProcess = pty.spawn('/bin/bash', [], {
    name: 'xterm-color',
    cols: 150,
    rows: 30,
    cwd: "/app/user",
    env: process.env
});

let browser;
let page;

io.attach(server)

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('terminal:write', (data) => {
        console.log('terminal write');
        ptyProcess.write(data);
    })
    socket.on('terminal:resize', ({ cols, rows }) => {
        ptyProcess.resize(cols, rows);
    });
    socket.on('file:rename', (data) => {
        renameFile(data.path, data.renameTo)
    })
    socket.on('file:delete', (data) => {
        deleteFile(data.path, data.type)
    })
    socket.on('file:create-folder', (data) => {
        createFolder(data.path)
    })
    socket.on('file:create-file', (data) => {
        createFile(data.path)
    })
    socket.on('file:change', (data) => {
        saveFileContent(data.path, data.code)
    })
    socket.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        handleSocketMessage(parsedMessage);
    })
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
    })
})

let fileTree = {}

chokidar.watch('/app/user').on('all', async (event, path) => {
    io.emit('file:refresh', path)
})

ptyProcess.onData(data => {
    console.log('pty-process-data', data);
    io.emit('terminal:data', data)
})

app.get('/', (req, res) => {
    res.send("Connected to server")
})

app.post('/browse', async (req, res) => {

    const { url } = req.headers
    const { port } = req.headers
    console.log("Received URL:", url); // Debugging line

    if (!browser) {
        console.log('Initiating browser');
        browser = await puppeteer.launch({
            args: ['--no-sandbox'],
            timeout: 10000,
            dumpio: true
        });
    }
    console.log('Browser', browser);

    page = await browser.newPage();
    console.log('Page', page);

    try {
        await page.goto(`${url}`);
        const htmlContent = await page.content();
        console.log('HTML Content', htmlContent);

        const cssStyles = await page.evaluate(() => {
            const styles = [];
            document.querySelectorAll('style').forEach(style => {
                styles.push(style.textContent)
            });
            return styles.join("\n");
        });
        console.log('CSS', cssStyles);

        res.send(`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Embedded Page</title>
                <style>${cssStyles}</style>
            </head>
            <body>
            ${htmlContent}
                <script src="/socket.io/socket.io.js"></script>
                <script>
                    const socket = io('https://automateandlearn.fun/dockermanager', {
                        extraHeaders: {
                            port: ${port}
                        }
                    });
                    
                    socket.on('connect', () => {
                        console.log('WebSocket connection established.');
                    });

                    socket.on('message', (message) => {
                        console.log('Received message:', message);
                    });
                </script>
            </body>
        </html>
      `);
    } catch (error) {
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Embedded Page</title>
                </head>
                <body>
                    <h1>${error.message}</h1>
                </body>
            </html>
        `)
    }
})

app.get('/files', async (req, res) => {
    fileTree = await generateFiletree('/app/user')
    return res.json([fileTree])
})

app.get('/files/content', async (req, res) => {
    const path = req.query.path
    const content = await fs.readFile(`/app/${path}`, 'utf-8')
    return res.json({ content })
})



server.listen(port, () => console.log(`🐳 Docker server running on port ${port}`))


async function generateFiletree(directory) {
    async function buildTree(currDirectory) {
        const files = await fs.readdir(currDirectory);
        const children = [];

        for (const file of files) {
            const filePath = path.join(currDirectory, file);
            const stat = await fs.stat(filePath);

            if (stat.isDirectory()) {
                const childTree = await buildTree(filePath);
                let directoryUniqid = uniqid()
                children.push({
                    id: `d-${directoryUniqid}`,
                    name: file,
                    children: childTree,
                });
            } else {
                let fileUniqid = uniqid()
                children.push({
                    id: `f-${fileUniqid}`,
                    name: file,
                });
            }
        }

        return children;
    }

    const tree = await buildTree(directory);
    return {
        id: `d-${tree.length}`,
        name: path.basename(directory),
        children: tree
    };
}

async function renameFile(path, renameTo) {
    const oldPath = `/app/${path}`
    const newPath = `/app/${renameTo}`

    await fs.rename(`${oldPath}`, `${newPath}`, (err) => {
        if (err) {
            console.error('Error renaming the file:', err);
        } else {
            console.log('File renamed successfully!');
        }
    })

}

async function deleteFile(path, type) {

    const completePath = `/app/${path}`

    if (type == 'directory') {
        await fs.rm(completePath, { recursive: true }, (err) => {
            console.log(err);
        })
    } else {
        await fs.unlink(completePath, (err) => {
            console.log(err);
        })
    }
}

async function createFolder(parentPath) {
    let defaultPath = '/app'
    let folderPath = `${defaultPath}/${parentPath}`
    let createdDirectory = ""

    if (parentPath == '/') {
        createdDirectory = await fs.mkdir(`${defaultPath}/user/NewFolder`, { recursive: true })
        console.log("Folder creted at root", createdDirectory);
    } else {
        createdDirectory = await fs.mkdir(`${folderPath}NewFolder`, { recursive: true })
        console.log("Folder creted", createdDirectory);
    }
}

async function createFile(parentPath) {
    let defaultPath = '/app'
    let folderPath = `${defaultPath}/${parentPath}`
    let createdFile = ""

    if (parentPath == '/') {
        createdFile = await fs.writeFile(`${defaultPath}/user/NewFile`, "", (err) => {
            console.log(err);
        })
        console.log("File creted at root", createdFile);
    } else {
        createdFile = await fs.writeFile(`${folderPath}NewFile`, "", (err) => {
            console.log(err);
        })
        console.log("File creted", createdFile);
    }
}

async function saveFileContent(path, content) {
    const completePath = `/app/${path}`
    await fs.writeFile(completePath, content)
}

async function handleSocketMessage(message) {
    switch (message.action) {
        case 'navigate':
            await navigate(message.url);
            break;

        default:
            break;
    }
}

async function navigate(url) {
    if (!page) {
        console.log("No page available for navigation.");
        return;
    }
    await page.goto(url)
}

process.on('exit', async () => {
    if (browser) {
        await browser.close();
    }
})


