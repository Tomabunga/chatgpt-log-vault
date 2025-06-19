// api/log.js
import fetch from 'node-fetch'
import TurndownService from 'turndown'
import { Octokit } from '@octokit/rest'
import cheerio from 'cheerio'

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
    // ———— HTML を取得（リダイレクトも自動フォロー） ————
    const resp = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
          'AppleWebKit/537.36 (KHTML, like Gecko) ' +
          'Chrome/113.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      redirect: 'follow'
    })
    const html = await resp.text()

    // ———— Cheerio でパース ————
    const $ = cheerio.load(html)

    // ———— ノイズ除去 ————
    // Next.js の JSON データやスクリプトを完全に削除
    $('script#\\__NEXT_DATA__').remove()
    $('script').remove()
    $('template').remove()
    $('style').remove()
    $('link').remove()
    // HTML コメントも消す
    $.root()
      .contents()
      .filter((i, el) => el.type === 'comment')
      .remove()

    // ———— 会話本文を抽出 ————
    // シェアページは <article> 要素内に Markdown 相当の HTML が入っている前提
    const article = $('article')
    if (!article.length) {
      throw new Error('Chat content container (<article>) not found')
    }
    const contentHtml = article.html() || ''

    // ———— Markdown 化 ————
    const td = new TurndownService()
    const markdown = td.turndown(contentHtml)

    // ———— GitHub にコミット ————
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `logs/${timestamp}.md`

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',            // ← ここをあなたのユーザー名に
      repo: 'chatgpt-log-vault',
      path,
      message: `Add ChatGPT log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64')
    })

    return res.status(200).json({ success: true, path })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: error.message || 'Server error' })
  }
}
