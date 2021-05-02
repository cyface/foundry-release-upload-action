// noinspection JSUnresolvedFunction,JSIgnoredPromiseFromCall

const core = require('@actions/core')
const fs = require('fs')
const github = require('@actions/github')
const download = require('download')
const shell = require('shelljs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')

const awsAccessKeyId = core.getInput('awsAccessKeyId')
const awsAccessSecret = core.getInput('awsAccessSecret')
const awsBucketName = core.getInput('awsBucketName')
const awsBucketRegion = core.getInput('awsBucketRegion')
const manifestFileName = core.getInput('manifestFileName')
const actionToken = core.getInput('actionToken')
const octokit = github.getOctokit(actionToken)
const owner = github.context.payload.repository.owner.login
const repo = github.context.payload.repository.name
const committer_email = github.context.payload.release.author.login
const committer_username = committer_email

async function getReleaseInfo () {
  // Download updated manifest file
  return await octokit.rest.repos.getLatestRelease({
    owner: owner,
    repo: repo,
  })
}

async function updateManifest (latestRelease) {
  try {
    // Download updated manifest file
    const manifestURL = `https://github.com/${owner}/${repo}/releases/download/${latestRelease.data.tag_name}/system.json`
    await download(manifestURL, '.')

    // Commit and push updated manifest
    await shell.exec(`git config user.email "${committer_email}"`)
    await shell.exec(`git config user.name "${committer_username}"`)
    await shell.exec(`git commit -am "Release ${latestRelease.data.tag_name}"`)
    await shell.exec(`git push origin main`)

  } catch (error) {
    core.setFailed(error.message)
  }
}

async function uploadZipFile (latestRelease) {
  try {
    // Download latest release zip
    const manifestURL = `https://github.com/${owner}/${repo}/releases/download/${latestRelease.data.tag_name}/${repo}.zip`
    await download(manifestURL, '.')
    const fileContent = fs.readFileSync(`${repo}.zip`)

    // Create an S3 client service object
    const s3 = new S3Client({ region: awsBucketRegion })
    const objectParams = { Bucket: awsBucketName, Key: 'testfile', Body: 'Hello World!' }
    const results = await s3.send(new PutObjectCommand(objectParams))
    console.log(results)

  } catch (error) {
    core.setFailed(error.message)
  }
}

async function run () {
  try {
    // Validate manifestFileName
    if (manifestFileName !== 'system.json' && manifestFileName !== 'module.json')
      core.setFailed('manifestFileName must be system.json or module.json')

    const latestRelease = await getReleaseInfo()
    await uploadManifest(latestRelease)
    await uploadZipFile(latestRelease)

  } catch (error) {
    core.setFailed(error.message)
  }
}

run()