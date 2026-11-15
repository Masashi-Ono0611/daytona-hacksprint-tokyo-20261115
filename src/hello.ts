import { Daytona } from '@daytonaio/sdk'

const daytona = new Daytona() // DAYTONA_API_KEY / DAYTONA_API_URL を env から読む
const sandbox = await daytona.create({ language: 'typescript' })
try {
  const r = await sandbox.process.codeRun('console.log("hello from daytona")')
  console.log(r.exitCode, r.result)
} finally {
  await sandbox.delete()
}
