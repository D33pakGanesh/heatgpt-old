import { Router, Request, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { buildSystemPrompt, sendMessage } from '../services/chatService'
import { ChatMessage } from '../types'

const router = Router()

const chatLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 })

const HeatStatsSchema = z.object({
  lgaId: z.string(),
  lgaName: z.string(),
  avgLstCelsius: z.number(),
  avgNdvi: z.number(),
  uhiIntensity: z.number(),
  dataSource: z.string(),
  dateRangeStart: z.string(),
  dateRangeEnd: z.string(),
  processedAt: z.string(),
})

const ChatRequestSchema = z.object({
  lgaId: z.string(),
  question: z.string().min(1).max(500),
  heatStats: HeatStatsSchema,
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string(),
        timestamp: z.coerce.date(),
      })
    )
    .optional(),
})

router.post('/chat', chatLimiter, async (req: Request, res: Response) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
  }

  const { heatStats, question, history } = parsed.data

  const systemPrompt = buildSystemPrompt(heatStats, heatStats.lgaName)

  const messages: ChatMessage[] = [
    ...(history ?? []),
    { role: 'user', content: question, timestamp: new Date() },
  ]

  try {
    const answer = await sendMessage(messages, systemPrompt)
    return res.status(200).json({ answer })
  } catch (err) {
    console.error('POST /chat LLM error:', err)
    return res.status(500).json({ error: 'HeatGPT is temporarily unavailable' })
  }
})

export default router
