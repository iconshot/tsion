# [Superbia](https://superbia.dev/)

JavaScript library for creating powerful APIs.

## Installation

```
npm i superbia
```

## Get started

### Server

1. Let's create a new `server`.

```js
const { Server } = require("superbia");

const server = new Server();
```

2. We add a type.

```js
server.setType("User", { id: "ID", name: "String" });
```

3. We add a request endpoint.

```js
server
  .setRequest("user") // endpoint name
  .setParams({ id: "ID" }) // endpoint params
  .setResult("User") // type returned by resolver
  .setResolver(({ params: { id } }) => {
    // dummy resolver

    const users = [
      { id: "1", name: "Jhon Doe" },
      { id: "2", name: "Jane Cat" },
    ];

    // only ids "1" and "2" will return a user, any other id will result in an error

    const user = users.find((user) => user.id === id);

    if (user === undefined) {
      throw new Error("User not found.");
    }

    return user;
  });
```

4. We start the `server` on the port we want.

```js
server.start(8080);
```

That's it. Our `server` is up and running.

### Client

Now, using `@superbia/client` we can access the endpoint just created.

```js
const response = await client.request({ user: { id: "1" } });

const data = response.data();

const {
  user: { name },
} = data;

console.log(name); // Jhon Doe
```

More on the `client` in the [@superbia/client's page](https://github.com/iconshot/superbia-client).

## Basics

### Types

Types can be objects, methods or arrays.

```js
server.setType("User", { id: "ID", name: "String" });

server.setType("EvenNumber", (value) => value % 2 === 0);

server.setType("PrimaryColor", ["red", "green", "blue"]);
```

The basic types are: `String`, `ID`, `Int`, `Float`, `Boolean`, `Date`, `Upload`.

### Composition

You can include a type in the schema of another type.

```js
server.setType("Coordinates", { latitude: "Float", longitude: "Float" });

server.setType("Restaurant", { name: "String", coordinates: "Coordinates" });
```

### Null or not

You can specify if a value can be null or not. A trailing `!` will be enough.

```js
server.setType("User", {
  id: "ID!", // can't be null
  firstPostId: "ID", // can be null
});
```

### Arrays

You can define arrays by using the syntax `[Type]`.

```js
server.setType("User", {
  stories: "[ID]", // "stories" array can be null, "stories" items can be null
  posts: "[ID]!", // "posts" array can't be null, "posts" items can be null
  friends: "[ID!]!", // "friends" array can't be null, "friends" items can't be null
});
```

## Uploads

You just need to add the `Upload` type as a parameter.

```js
server
  .setRequest("uploadPhoto")
  .setParams({ upload: "Upload" }) // notice the Upload type
  .setResolver(async ({ params: { upload } }) => {
    // get the name of the file

    const name = upload.getName();

    // uploads will be kept in memory until we save them

    await upload.write(name);
  });
```

## Subscriptions

We'll understand subscriptions better with an example.

Let's say we have a `counter` and we want to create a subscription for listening to changes in this `counter`.

```js
let counter = 0;
```

We define the subscription endpoint:

```js
server
  .setSubscription("counter")
  .setResult("Int") // it works the same way as in requests
  .setResolver(() => {
    // instead of returning the data right away
    // we return an object with two properties
    // subscribe (required) and unsubscribe (optional)

    return {
      subscribe: () => {
        return "counterRoom"; // a room key
      },
    };
  });
```

Later on your server you run:

```js
counter++;

server.publish("counterRoom", counter); // notice how we use the same room key as before
```

The explanation is simple:

`setSubscription` will attach a `roomKey` to a subscription. Then, when we publish data to that `roomKey`, the subscription will be notified.
