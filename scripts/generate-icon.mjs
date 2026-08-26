import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const source = resolve('build/icon.svg')
const destination = resolve('build/icon.png')

await mkdir(resolve('build'), { recursive: true })
await sharp(source).resize(512, 512).png({ compressionLevel: 9 }).toFile(destination)
