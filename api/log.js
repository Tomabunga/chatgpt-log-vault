import fetch from 'node-fetch'
import TurndownService from 'turndown'
import { Octokit } from '@octokit/rest'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    // 1) HTML 取得
    const resp = await fetch(url)
    const html = await resp.text()

    // 2) Markdown 変換
    const td = new TurndownService()
    const markdown = td.turndown(html)

    // 3) GitHub にコミット
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `logs/${timestamp}.md`

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',           // ← ご自身の GitHub ユーザー名に置き換えてください
      repo: 'chatgpt-log-vault',
      path,
      message: `Add log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64'),
    })

    res.status(200).json({ ok: true, path })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Internal error' })
  }
}
