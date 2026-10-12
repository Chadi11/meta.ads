FROM apify/actor-node:20

# Copy dependency manifests
COPY package*.json ./

# Install ALL dependencies including production compiler tools
RUN npm --quiet set progress=false \
 && npm install --no-optional

# Copy source files
COPY . ./

# Build TypeScript
RUN npm run build || true

# Default startup command
CMD ["npm", "start"]
