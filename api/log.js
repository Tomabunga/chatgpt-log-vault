// api/log.js

import fetch from 'node-fetch'
import { Octokit } from '@octokit/rest'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }
  const { url } = req.body
  if (!url) return res.status(400).json({ error: 'Missing url' })

  try {
    // ———— 1) HTML 取得 ————
    const HEADERS = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/113.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    }
    let resp = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    let html = await resp.text()

    // Cloudflare タイムアウト検出 → プロキシフォールバック
    if (resp.status !== 200 || html.toLowerCase().includes('error code')) {
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
      resp = await fetch(proxy, { redirect: 'follow' })
      html = await resp.text()
    }

    // ———— 2) __NEXT_DATA__ JSON 抽出 ————
    const match = html.match(
      /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
    )
    if (!match) {
      throw new Error('__NEXT_DATA__ JSON not found')
    }
    const data = JSON.parse(match[1])

    // ———— 3) 会話メッセージを Markdown に整形 ————
    // JSON の構造は変更される可能性がありますが、現状は以下想定
    const conv = data.props?.pageProps?.conversation
    if (!Array.isArray(conv)) {
      throw new Error('Conversation data not found in JSON')
    }

    // 各メッセージを role + 「content.parts」を改行で結合
    const mdLines = conv.map((msg, i) => {
      const role = msg.author?.role || msg.role || 'message'
      const parts = Array.isArray(msg.content?.parts)
        ? msg.content.parts
        : [msg.content?.text || '']
      return `## ${role}\n\n${parts.join('\n\n')}`
    })
    const markdown = mdLines.join('\n\n---\n\n')

    // ———— 4) GitHub にコミット ————
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `logs/${timestamp}.md`

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',          // ← 自分のユーザー名に書き換え
      repo: 'chatgpt-log-vault',
      path,
      message: `Add ChatGPT log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64'),
    })

    return res.status(200).json({ success: true, path })
  } catch (err) {
    console.error(err)
    return res
      .status(500)
      .json({ error: err.message || 'Server error' })
  }
}
