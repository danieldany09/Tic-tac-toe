.PHONY: install test test-validation test-all

install:
	npm install

test: install
	node integration.js

test-validation: install
	node validation.js

test-all: install
	node integration.js && node validation.js
