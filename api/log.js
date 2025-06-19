// api/log.js

import fetch from 'node-fetch'
import TurndownService from 'turndown'
import { Octokit } from '@octokit/rest'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow','POST')
    return res.status(405).end('Method Not Allowed')
  }
  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' })
  }

  try {
    // ———— ScrapingBee 経由でHTML取得 ————
    const sbApiKey = process.env.SCRAPINGBEE_KEY
    const sbUrl =
      `https://app.scrapingbee.com/api/v1/` +
      `?api_key=${encodeURIComponent(sbApiKey)}` +
      `&render_js=true` +
      `&url=${encodeURIComponent(url)}`

    const sbResp = await fetch(sbUrl)
    if (!sbResp.ok) {
      throw new Error(`ScrapingBee API Error: ${sbResp.status}`)
    }
    const html = await sbResp.text()

    // ———— Turndown で Markdown に変換 ————
    const td = new TurndownService()
    const markdown = td.turndown(html)

    // ———— GitHub にコミット ————
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g,'-')
    const path = `logs/${timestamp}.md`
    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',          // ← ご自身のユーザー名に置き換え
      repo: 'chatgpt-log-vault',
      path,
      message: `Add ChatGPT log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64'),
    })

    return res.status(200).json({ success: true, path })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
