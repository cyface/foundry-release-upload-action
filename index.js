// noinspection JSUnresolvedFunction,JSIgnoredPromiseFromCall

const { core } = require('@actions/core')
const { fs } = require('fs')
const { github } = require('@actions/github')
const { download } = require('download')
const { shell } = require('shelljs')
const { AWS } = require('aws-sdk')

const awsAccessKeyId = core.getInput('awsAccessKeyId')
const awsAccessSecret = core.getInput('awsAccessSecret')
const awsBucketName = core.getInput('awsBucketName')
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

    const s3 = new AWS.S3({
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsAccessSecret
    })

    // Setting up S3 upload parameters
    const params = {
      Bucket: awsBucketName,
      Key: `${repo}-${latestRelease.data.tag_name}.zip`,
      Body: fileContent
    }

    // Uploading files to the bucket
    s3.upload(params, function (err, data) {
      if (err) {
        throw err
      }
      console.log(`File uploaded successfully. ${data.Location}`)
    })

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