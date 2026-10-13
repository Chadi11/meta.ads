FROM apify/actor-node-playwright:20

# Copy dependency manifests
COPY package*.json ./

# Install dependencies including Playwright and Crawlee
RUN npm --quiet set progress=false \
 && npm install --no-optional

# Copy source files
COPY . ./

# Build TypeScript
RUN npm run build || true

# Default startup command
CMD ["npm", "start"]
