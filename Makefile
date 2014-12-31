test:
	@NODE_ENV=test node_modules/.bin/mocha --harmony
test-cov:
	@NODE_ENV=test node --harmony node_modules/.bin/istanbul cover node_modules/.bin/_mocha -- -R dot test/*.js
test-clean:
	mysqlshow -uroot | \grep $$(node -p require\(\'./package\'\).name)-test- | \awk '{ print $$2 }' | xargs -I db mysqladmin -uroot drop -f db

.PHONY: test test-cov test-clean