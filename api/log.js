// api/log.js

import chromium from 'chrome-aws-lambda'
import TurndownService from 'turndown'
import { Octokit } from '@octokit/rest'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const { url } = req.body
  if (!url) {
    return res.status(400).json({ error: 'Missing url in request body' })
  }

  let browser = null
  try {
    // ———— Puppeteer（chrome-aws-lambda 経由）起動 ————
    browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/113.0.0.0 Safari/537.36'
    )
    await page.goto(url, { waitUntil: 'networkidle0' })

    // ———— 会話部分をセレクタで抜き出し ————
    const contentHtml = await page.evaluate(() => {
      // 実際の DOM を確認し、会話を包む適切なセレクタにしてください
      const container = document.querySelector('article')
      return container ? container.innerHTML : ''
    })

    await browser.close()

    if (!contentHtml) {
      throw new Error('Conversation container not found')
    }

    // ———— Markdown に変換 ————
    const markdown = new TurndownService().turndown(contentHtml)

    // ———— GitHub にコミット ————
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = `logs/${timestamp}.md`

    await octokit.repos.createOrUpdateFileContents({
      owner: 'Tomabunga',           // ← ご自身の GitHub ユーザー名に
      repo: 'chatgpt-log-vault',
      path,
      message: `Add ChatGPT log ${timestamp}`,
      content: Buffer.from(markdown).toString('base64'),
    })

    return res.status(200).json({ success: true, path })
  } catch (err) {
    if (browser) await browser.close()
    console.error(err)
    return res.status(500).json({ error: err.message || 'Server error' })
  }
}
