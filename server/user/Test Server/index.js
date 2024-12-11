const express = require('express')
const app = express()

const port = 8080


app.get('/', (req, res) => {
    res.json({msg: "Message from Test Server"})
})


app.listen(port, () => {
    console.log(`Test Server Listening On Port ${port}`)
})
