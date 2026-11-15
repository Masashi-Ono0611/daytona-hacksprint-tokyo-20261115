import { Daytona } from '@daytonaio/sdk'

// .env と process env の両方に API_URL があると SDK が曖昧エラーにするため、apiUrl は明示する
const daytona = new Daytona({
  apiKey: process.env.DAYTONA_API_KEY,
  apiUrl: process.env.DAYTONA_API_URL,
})
const sandbox = await daytona.create({ language: 'typescript' })
try {
  const r = await sandbox.process.codeRun('console.log("hello from daytona")')
  console.log(r.exitCode, r.result)
} finally {
  await sandbox.delete()
}
