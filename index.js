// noinspection JSUnresolvedFunction,JSIgnoredPromiseFromCall

const core = require('@actions/core')
const fs = require('fs')
const github = require('@actions/github')
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
  return await octokit.rest.repos.getLatestRelease({
    owner: owner,
    repo: repo,
  })
}

async function uploadManifest (latestRelease) {
  /*
  This assumes that we are in a checkout of dcc-content
  It downloads the latest manifest from the release and checks it in to dcc-content in a new dir
   */
  try {
    // Get the Asset ID of the manifest from the release info
    let assetID = 0
    for (const item of latestRelease.data.assets) {
      if (item.name === manifestFileName) {
        assetID = item.id
      }
    }
    if (assetID === 0) {
      console.log(latestRelease)
      core.setFailed('No AssetID for manifest')
    }

    const manifestLocalFileName = `./${repo}/${latestRelease.data.tag_name}/${manifestFileName}`
    await shell.exec(`mkdir ./${repo}/${latestRelease.data.tag_name}`)
    console.log(manifestLocalFileName)

    // Download Manifest
    const manifestURL = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetID}`
    console.log(manifestURL)
    await shell.exec(`curl --header 'Authorization: token ${actionToken}' --header 'Accept: application/octet-stream' --output ${manifestLocalFileName} --location ${manifestURL}`)
    console.log('Past Download')
    console.log(shell.exec(`ls dcc-core-book`))

    // Save release notes to RELEASE_NOTES.md
    const releaseNotes = latestRelease.data.body || 'No release notes available.'
    fs.writeFileSync('RELEASE_NOTES.md', releaseNotes, 'utf8')

    // Commit and push updated manifest
    await shell.exec(`git config user.email "${committer_email}"`)
    await shell.exec(`git config user.name "${committer_username}"`)
    await shell.exec(`git add *`)
    await shell.exec(`git status`)
    await shell.exec(`git commit -am "Release ${latestRelease.data.tag_name}"`)
    await shell.exec(`git push origin main`)

  } catch (error) {
    core.setFailed(error.message)
  }
}

async function uploadZipFile (latestRelease) {
  try {
    // Get the Asset ID of the zip from the release info
    let assetID = 0
    for (const item of latestRelease.data.assets) {
      if (item.name === `${repo}.zip`) {
        assetID = item.id
      }
    }
    if (assetID === 0) {
      console.log(latestRelease)
      core.setFailed('No AssetID for manifest')
    }

    // Download the Zip
    const zipURL = `https://api.github.com/repos/${owner}/${repo}/releases/assets/${assetID}`
    console.log(zipURL)
    await shell.exec(`curl --header 'Authorization: token ${actionToken}' --header 'Accept: application/octet-stream' --output ${repo}.zip --location ${zipURL}`)
    console.log('Past Download')
    const fileContent = fs.readFileSync(`${repo}.zip`)

    // Upload the release zip to S3
    const s3 = new S3Client({
      region: awsBucketRegion,
      credentials: { accessKeyId: awsAccessKeyId, secretAccessKey: awsAccessSecret }
    })
    const objectParams = { Bucket: awsBucketName, Key: `products/${repo}/${repo}-${latestRelease.data.tag_name.replace('v','')}.zip`, Body: fileContent }
    await s3.send(new PutObjectCommand(objectParams))

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
