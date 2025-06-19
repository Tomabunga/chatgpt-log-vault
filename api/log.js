// api/log.js

import fetch from 'node-fetch'
import TurndownService from 'turndown'
import { Octokit } from '@octokit/rest'
// named import で load を取り込む
import { load } from 'cheerio'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' })
  }

  try {
    // ———— HTML を取得 ————
    const HEADERS = {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/113.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml'
    }

    let resp = await fetch(url, { headers: HEADERS, redirect: 'follow' })
    let html = await resp.text()

    if (resp.status !== 200 || html.toLowerCase().includes('error code')) {
      // プロキシフォールバック
      const proxy = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url)
      resp = await fetch(proxy, { redirect: 'follow' })
      html = await resp.text()
    }

    // ———— Cheerio でパース＆不要要素除去 ————
    const $ = load(html)
    $('script#__NEXT_DATA__, script, template, style, link').remove()
    $.root()
     .contents()
     .filter((_, el) => el.type === 'comment')
     .remove()

    // ———— 会話本文を抽出 ————
    const article = $('article')
    if (!article.length) {
      throw new Error('Chat content container (<article>) not found')
    }
    const contentHtml = article.html() || ''

    // ———— Markdown に変換 ————
    const markdown = new TurndownService().turndown(contentHtml)

    // ———— GitHub にコミット ————
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = `logs/${timestamp}.md`

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',           // ← ご自身の GitHub ユーザー名に
      repo: 'chatgpt-log-vault',
      path: filePath,
      message: `Add ChatGPT log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64'),
    })

    return res.status(200).json({ success: true, path: filePath })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error.message || 'Server error' })
  }
}
