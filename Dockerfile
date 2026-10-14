FROM apify/actor-node:20

# Copy dependency manifests
COPY package*.json ./

# Install dependencies rapidly
RUN npm --quiet set progress=false \
 && npm install --omit=dev --no-optional

# Copy application source files
COPY . ./

# Build TypeScript
RUN npm run build || true

# Default startup command
CMD ["npm", "start"]
