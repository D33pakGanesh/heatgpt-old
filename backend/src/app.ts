import express from "express"
import cors from "cors"
import compression from "compression"
import dotenv from "dotenv"

import lgaRouter from "./routes/lga"
import chatRouter from "./routes/chat"
import { initEarthEngine } from "./services/earthEngineService"

dotenv.config()

const app = express()

app.use(compression())
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "*" }))
app.use(express.json())

app.use("/api", lgaRouter)
app.use("/api", chatRouter)

export async function startServer() {
  try {
    console.log("Initialising Earth Engine...")
    await initEarthEngine()
    console.log("Earth Engine ready")
  } catch (err: any) {
    console.warn("Earth Engine failed to initialise:", err.message)
  }

  return app
}

export default app