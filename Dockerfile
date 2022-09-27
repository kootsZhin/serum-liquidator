FROM node:16-alpine3.11


# Create Directory for the Container
RUN mkdir -p /home/serum-liquidator/app
WORKDIR /home/serum-liquidator/app

# Increase heap size
ENV NODE_OPTIONS=--max_old_space_size=4096

# Only copy the package.json file to work directory /// REMOVED package-lock.json 
COPY package.json ./
# Install all Packages
RUN npm install

# Copy all other source code to work directory
COPY src /home/serum-liquidator/app/src
COPY payer.json /home/serum-liquidator/app
COPY tsconfig.json /home/serum-liquidator/app
RUN npm run build

# Start
CMD ["npm", "start"]