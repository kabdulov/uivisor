const { withUivisor } = require('uivisor/next')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = withUivisor(nextConfig)
